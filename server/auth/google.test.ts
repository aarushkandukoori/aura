/**
 * Google sign-in tests. The real flow runs end to end against the real server; only Google's two
 * endpoints (the code exchange and the userinfo lookup) are answered by a fake inside this test.
 * Covers PKCE + state, the cookie for the web, aura://auth?token= for the iPhone app, cancelling,
 * replayed or forged callbacks, and moving to the public address first. Run with `npm test`.
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type { Session } from '../../shared/types.ts'

/** A free port, so AURA_PUBLIC_URL can name the address before the app starts. */
async function freePort(): Promise<number> {
  const probe = http.createServer().listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => probe.once('listening', () => resolve()))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}

const port = await freePort()
const base = `http://127.0.0.1:${port}`
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-google-'))
process.env.AURA_DATA_DIR = dataDir
process.env.AURA_PROVIDER = 'offline'
process.env.AURA_PUBLIC_URL = base
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET = ['only', 'for', 'tests'].join('-')
delete process.env.AURA_DEV_LOGIN

const { createApp } = await import('../app.ts')
const { closeAccounts } = await import('../db/accounts.ts')
const { closeAllWorlds } = await import('../db/index.ts')

let server: http.Server

/** What the fake Google saw at its token endpoint. */
let tokenRequests: URLSearchParams[] = []

before(async () => {
  server = createApp().listen(port, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  // Google's endpoints answer from here; every other request goes out for real (to our server).
  const realFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url === 'https://oauth2.googleapis.com/token') {
      const form = new URLSearchParams(String(init?.body))
      tokenRequests.push(form)
      return form.get('code') === 'good-code' ? Response.json({ access_token: 'test-access' }) : Response.json({ error: 'invalid_grant' }, { status: 400 })
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-access')
      return Response.json({ sub: '1029384756', email: 'gia@example.com', email_verified: true, name: 'Gia Romano', picture: 'https://example.com/gia.jpg' })
    }
    return realFetch(input, init)
  }
})

after(() => {
  server.closeAllConnections()
  server.close()
  closeAllWorlds()
  closeAccounts()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

/** Start a sign-in like a browser would: returns Google's URL parameters and the flow cookie. */
async function start(query: string): Promise<{ google: URL; flowCookie: string }> {
  const res = await fetch(`${base}/auth/google?${query}`, { redirect: 'manual' })
  assert.equal(res.status, 302)
  const google = new URL(res.headers.get('location') ?? '')
  const setCookie = res.headers.get('set-cookie') ?? ''
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /Path=\/auth\/google/)
  return { google, flowCookie: setCookie.split(';')[0] }
}

/** Google sending the browser back. Returns where we send it next, and the cookies we set. */
async function callback(query: string, cookie: string): Promise<{ location: string; setCookie: string }> {
  const res = await fetch(`${base}/auth/google/callback?${query}`, { redirect: 'manual', headers: { cookie } })
  assert.equal(res.status, 302)
  return { location: res.headers.get('location') ?? '', setCookie: res.headers.get('set-cookie') ?? '' }
}

test('the session says sign-in is on before anyone signs in', async () => {
  const session = (await (await fetch(`${base}/api/session`)).json()) as Session
  assert.equal(session.authEnabled, true)
  assert.equal(session.account, null)
})

test('the web flow: Google with PKCE and state, then a session cookie and the page you wanted', async () => {
  const { google, flowCookie } = await start('platform=web&next=%2Fp%2Fabc')
  assert.equal(google.origin + google.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.equal(google.searchParams.get('client_id'), 'test-client.apps.googleusercontent.com')
  assert.equal(google.searchParams.get('redirect_uri'), `${base}/auth/google/callback`)
  assert.equal(google.searchParams.get('scope'), 'openid email profile')
  assert.equal(google.searchParams.get('response_type'), 'code')
  assert.equal(google.searchParams.get('code_challenge_method'), 'S256')
  const state = google.searchParams.get('state') ?? ''

  tokenRequests = []
  const { location, setCookie } = await callback(`code=good-code&state=${state}`, flowCookie)
  assert.equal(location, '/p/abc', 'back to the page they wanted')
  assert.match(setCookie, /aura_session=[\w-]+;.*HttpOnly.*SameSite=Lax/)

  // The code went to Google with the verifier that matches the challenge, and our secret.
  const [form] = tokenRequests
  const verifier = form.get('code_verifier') ?? ''
  assert.equal(crypto.createHash('sha256').update(verifier).digest('base64url'), google.searchParams.get('code_challenge'))
  assert.equal(form.get('client_secret'), process.env.GOOGLE_CLIENT_SECRET)
  assert.equal(form.get('redirect_uri'), `${base}/auth/google/callback`)

  const cookie = setCookie.match(/aura_session=[\w-]+/)?.[0] ?? ''
  const session = (await (await fetch(`${base}/api/session`, { headers: { cookie } })).json()) as Session
  assert.deepEqual(session.account && { email: session.account.email, name: session.account.name, picture: session.account.picture },
    { email: 'gia@example.com', name: 'Gia Romano', picture: 'https://example.com/gia.jpg' })
  assert.equal(session.onboarded, false, 'a brand new world')
})

test('the iPhone flow hands the token to aura://auth, and it works as a Bearer token', async () => {
  const { google, flowCookie } = await start('platform=ios')
  const { location, setCookie } = await callback(`code=good-code&state=${google.searchParams.get('state')}`, flowCookie)
  assert.match(location, /^aura:\/\/auth\?token=[\w-]+$/)
  assert.doesNotMatch(setCookie, /aura_session=[\w-]/, 'the iPhone app keeps the token itself')
  const token = new URL(location).searchParams.get('token')
  const session = (await (await fetch(`${base}/api/session`, { headers: { authorization: `Bearer ${token}` } })).json()) as Session
  assert.equal(session.account?.email, 'gia@example.com', 'the same Google account, the same world')
})

test('cancelled, forged, replayed and failed callbacks never sign anyone in', async (t) => {
  t.mock.method(console, 'warn', () => {}) // the failed code exchange is logged
  const { google, flowCookie } = await start('platform=web')
  const state = google.searchParams.get('state')

  assert.equal((await callback('error=access_denied', flowCookie)).location, '/signin?error=cancelled')
  assert.equal((await callback(`code=good-code&state=someone-elses-state`, flowCookie)).location, '/signin?error=expired')
  assert.equal((await callback(`code=good-code&state=${state}`, '')).location, '/signin?error=expired', 'no flow cookie: not started here')
  const failed = await callback(`code=bad-code&state=${state}`, flowCookie)
  assert.equal(failed.location, '/signin?error=google')
  assert.doesNotMatch(failed.setCookie, /aura_session=[\w-]/)

  const ios = await start('platform=ios')
  assert.equal((await callback('error=access_denied', ios.flowCookie)).location, 'aura://auth?error=cancelled')
})

test('only paths on this site are allowed as the page to open after signing in', async () => {
  for (const next of ['https://evil.example', '//evil.example', '/\\evil.example']) {
    const { google, flowCookie } = await start(`platform=web&next=${encodeURIComponent(next)}`)
    assert.equal((await callback(`code=good-code&state=${google.searchParams.get('state')}`, flowCookie)).location, '/')
  }
})

test('a sign-in started on another address moves to the public address first', async () => {
  // Same server, reached as "localhost" instead of the public 127.0.0.1 address.
  const res = await fetch(`http://localhost:${port}/auth/google?platform=web`, { redirect: 'manual' })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), `${base}/auth/google?platform=web`)
  assert.equal(res.headers.get('set-cookie'), null)
})
