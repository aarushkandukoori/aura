/**
 * Accounts tests: with sign-in on, every account gets its own world. Two people sign in through
 * the test-only dev login and use the app side by side; nothing of one (posts, uploads, DMs,
 * settings, live events, Start over) may ever reach the other. Also: signed-out requests get 401,
 * sign-out works for cookies and Bearer tokens, the model list follows the environment, and the
 * scheduler runs each world's jobs inside that world. Run with `npm test`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import type {
  ConversationsResponse, LiveEvent, Message, Page, Post, Session, Settings, SignedInAccount, UploadResponse,
} from '../shared/types.ts'

// Configuration is read when modules load, so set it before importing the app.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-accounts-'))
process.env.AURA_DATA_DIR = dataDir
process.env.AURA_PROVIDER = 'offline'
process.env.AURA_DEV_LOGIN = '1'
process.env.AURA_ALLOWED_MODELS = 'haiku, sonnet'
process.env.AURA_DEFAULT_MODEL = 'haiku'
delete process.env.GOOGLE_CLIENT_ID
delete process.env.GOOGLE_CLIENT_SECRET

const { createApp } = await import('./app.ts')
const { closeAccounts } = await import('./db/accounts.ts')
const { closeAllWorlds, closeWorld, currentWorldId, q, withWorld } = await import('./db/index.ts')
const { onPresenceChange } = await import('./live.ts')
const scheduler = await import('./sim/scheduler.ts')

let server: Server
let base = ''

before(async () => {
  server = createApp().listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => {
  scheduler.stopScheduler()
  server.closeAllConnections()
  server.close()
  closeAllWorlds()
  closeAccounts()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

/** A signed-in person: their Bearer token and account. */
interface Person { token: string; account: SignedInAccount }

async function devLogin(email: string, name: string): Promise<Person> {
  const res = await fetch(`${base}/auth/dev`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name }),
  })
  assert.equal(res.status, 200)
  return (await res.json()) as Person
}

/** Call the API as someone (or signed out) and return status + parsed JSON body. */
async function call(who: Person | null, method: string, route: string, body?: unknown) {
  const headers: Record<string, string> = {}
  if (who) headers.authorization = `Bearer ${who.token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${base}/api${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, body: (await res.json()) as unknown }
}

async function api<T>(who: Person, method: string, route: string, body?: unknown): Promise<T> {
  const { status, body: data } = await call(who, method, route, body)
  assert.ok(status < 300, `${method} ${route} answered ${status}: ${JSON.stringify(data)}`)
  return data as T
}

/** A live stream as someone. next() is the next event; nextWithin(ms) is null when none comes in time. */
async function openStream(who: Person) {
  const controller = new AbortController()
  const res = await fetch(`${base}/api/live`, { headers: { authorization: `Bearer ${who.token}` }, signal: controller.signal })
  assert.equal(res.status, 200)
  assert.ok(res.body)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let pending: ReturnType<typeof reader.read> | null = null

  async function next(): Promise<LiveEvent> {
    while (!buffer.includes('\n\n')) {
      pending ??= reader.read()
      const { value, done } = await pending
      pending = null
      if (done) throw new Error('the stream ended')
      buffer += decoder.decode(value, { stream: true })
    }
    const end = buffer.indexOf('\n\n')
    const frame = buffer.slice(0, end)
    buffer = buffer.slice(end + 2)
    const data = frame.split('\n').find((line) => line.startsWith('data: '))
    return data ? (JSON.parse(data.slice(6)) as LiveEvent) : next() // skip "retry:" and ping frames
  }

  async function nextWithin(ms: number): Promise<LiveEvent | null> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms) })
    try {
      return await Promise.race([next(), timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  return { next, nextWithin, close: () => controller.abort() }
}

/** A 1x1 PNG, the smallest real image (a fresh Blob per request: fetch may take over the bytes it sends). */
const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const png = () => new Blob([PNG_BYTES], { type: 'image/png' })

async function upload(who: Person): Promise<UploadResponse> {
  const res = await fetch(`${base}/api/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${who.token}`, 'content-type': 'image/png' },
    body: png(),
  })
  assert.equal(res.status, 200)
  return (await res.json()) as UploadResponse
}

const onboarding = (displayName: string, username: string) => ({
  displayName, username, avatar: null, bio: '', pronouns: '', interests: ['music', 'food', 'travel'], tier: 'popular', origin: 'college',
})

let ana: Person
let ben: Person
let anasPost: Post

test('signed out: the session says so, everything else answers 401', async () => {
  const session = (await call(null, 'GET', '/session')).body as Session
  assert.equal(session.authEnabled, true)
  assert.equal(session.account, null)
  assert.equal(session.onboarded, false)
  assert.equal(session.me, null)
  assert.deepEqual(session.badges, { notifications: 0, messages: 0 })
  assert.equal(session.settings.model, 'haiku')

  for (const [method, route] of [['GET', '/feed'], ['GET', '/settings'], ['POST', '/onboarding'], ['GET', '/live'], ['POST', '/reset'], ['GET', '/nope']]) {
    const res = await call(null, method, route, method === 'POST' ? {} : undefined)
    assert.deepEqual(res, { status: 401, body: { error: 'Sign in to continue' } }, `${method} ${route}`)
  }
  const uploadSignedOut = await fetch(`${base}/api/upload`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png() })
  assert.equal(uploadSignedOut.status, 401)
  assert.equal((await call(null, 'GET', '/health')).status, 200)
  assert.equal((await call(null, 'GET', '/avatars')).status, 200)
  const forged = await call({ token: 'not-a-real-token', account: null as never }, 'GET', '/feed')
  assert.equal(forged.status, 401)
})

test('code outside a world fails loudly instead of guessing whose world it is', () => {
  assert.throws(() => q('SELECT 1'), /withWorld/)
})

test('two people sign in and each builds their own world', async () => {
  ana = await devLogin('ana@example.com', 'Ana Lima')
  ben = await devLogin('ben@example.com', 'Ben Okafor')
  assert.notEqual(ana.account.id, ben.account.id)
  assert.equal((await devLogin('ana@example.com', 'Ana Lima')).account.id, ana.account.id, 'the same email is the same account')

  const anaSession = await api<Session>(ana, 'POST', '/onboarding', onboarding('Ana Lima', 'ana.lima'))
  // Both may pick the same username: they live in different worlds.
  const benSession = await api<Session>(ben, 'POST', '/onboarding', onboarding('Ben Okafor', 'ana.lima'))
  assert.deepEqual(anaSession.account, ana.account)
  assert.equal(benSession.account?.email, 'ben@example.com')
  assert.equal(anaSession.me?.displayName, 'Ana Lima')
  assert.equal(benSession.me?.displayName, 'Ben Okafor')
  assert.ok(fs.existsSync(path.join(dataDir, 'worlds', ana.account.id, 'aura.db')), 'a world file per account')
  assert.ok(fs.existsSync(path.join(dataDir, 'worlds', ben.account.id, 'aura.db')))
})

test('posts and uploads stay in their own world', async () => {
  const photo = await upload(ana)
  assert.match(photo.url, new RegExp(`^/media/${ana.account.id}/[\\w-]+\\.png$`))
  assert.equal((await fetch(base + photo.url)).status, 200, 'the upload is served at its URL')
  const file = photo.url.split('/').pop()
  assert.equal((await fetch(`${base}/media/${ben.account.id}/${file}`)).status, 404, 'not under another world')
  assert.equal((await fetch(`${base}/media/${ana.account.id}/..%2F..%2Faccounts.db`)).status, 404)
  assert.equal((await fetch(`${base}/media/uploads/${file}`)).status, 404, 'no local-mode URLs with sign-in on')

  anasPost = await api<Post>(ana, 'POST', '/posts', { kind: 'photo', media: [{ url: photo.url, type: 'image' }], caption: 'only mine #anaonly' })
  const anaFeed = await api<Page<Post>>(ana, 'GET', '/feed')
  assert.equal(anaFeed.items[0].id, anasPost.id)

  const benFeed = await api<Page<Post>>(ben, 'GET', '/feed')
  assert.ok(!benFeed.items.some((post) => post.id === anasPost.id))
  assert.equal((await call(ben, 'GET', `/posts/${anasPost.id}`)).status, 404)
  assert.equal((await api<Page<Post>>(ben, 'GET', '/tags/anaonly')).items.length, 0)
  assert.equal((await api<Session>(ben, 'GET', '/session')).me?.postCount, 0)

  // Ben can't put Ana's upload in his own post, even with the URL.
  const borrowed = await call(ben, 'POST', '/posts', { kind: 'photo', media: [{ url: photo.url, type: 'image' }], caption: '' })
  assert.equal(borrowed.status, 400)
})

test('DMs and settings stay in their own world', async () => {
  const anaDm = await api<{ id: string }>(ana, 'POST', '/conversations', { memberIds: ['maya'] })
  await api<Message>(ana, 'POST', `/conversations/${anaDm.id}/messages`, { text: 'secret plans for friday' })
  const benInbox = await api<ConversationsResponse>(ben, 'GET', '/conversations')
  const everything = [...benInbox.conversations, ...benInbox.requests]
  assert.ok(everything.every((conversation) => conversation.lastMessage?.text !== 'secret plans for friday'))
  assert.equal((await call(ben, 'GET', `/conversations/${anaDm.id}/messages`)).status, 404)

  const anaSettings = await api<Settings>(ana, 'PATCH', '/settings', { speed: 'instant', model: 'sonnet', tier: 'icon' })
  assert.deepEqual([anaSettings.speed, anaSettings.model, anaSettings.tier], ['instant', 'sonnet', 'icon'])
  const benSettings = await api<Settings>(ben, 'GET', '/settings')
  assert.deepEqual([benSettings.speed, benSettings.model, benSettings.tier], ['fast', 'haiku', 'popular'])
})

test('the model list comes from the environment, and other models are refused', async () => {
  const settings = await api<Settings>(ben, 'GET', '/settings')
  assert.deepEqual(settings.models, ['sonnet', 'haiku'])
  const refused = await call(ben, 'PATCH', '/settings', { model: 'opus' })
  assert.equal(refused.status, 400)
  assert.equal((await api<Settings>(ben, 'GET', '/settings')).model, 'haiku')
})

test('live events only reach the apps of the same world', { timeout: 10_000 }, async () => {
  const presence: [string, number][] = []
  const unsubscribe = onPresenceChange((count) => presence.push([currentWorldId(), count]))
  const anaStream = await openStream(ana)
  const benStream = await openStream(ben)
  assert.equal((await anaStream.next()).type, 'hello')
  assert.equal((await benStream.next()).type, 'hello')
  assert.deepEqual(presence, [[ana.account.id, 1], [ben.account.id, 1]], 'presence is counted per world')

  await api(ana, 'POST', `/posts/${anasPost.id}/like`)
  const stats = await anaStream.next()
  assert.equal(stats.type, 'post.stats')
  assert.equal(await benStream.nextWithin(400), null, "Ben's app hears nothing about Ana's like")

  // Start over wipes only Ana's world; Ben's app doesn't hear about it either.
  await api(ana, 'POST', '/reset')
  assert.equal((await anaStream.next()).type, 'reset')
  assert.equal(await benStream.nextWithin(400), null)
  assert.equal((await api<Session>(ana, 'GET', '/session')).onboarded, false)
  const benSession = await api<Session>(ben, 'GET', '/session')
  assert.equal(benSession.onboarded, true)
  assert.equal(benSession.me?.displayName, 'Ben Okafor')

  benStream.close()
  anaStream.close()
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.deepEqual(presence.slice(2).sort(), [[ana.account.id, 0], [ben.account.id, 0]].sort())
  unsubscribe()
})

test('the scheduler runs each world\'s jobs inside that world, even after it was closed', { timeout: 10_000 }, async (t) => {
  t.mock.method(console, 'warn', () => {}) // onboarding's welcome jobs have no handler in this test
  const ran: [string, string][] = []
  const handlers = { probe: (payload: { who: string }) => void ran.push([currentWorldId(), payload.who]) }
  withWorld(ana.account.id, () => scheduler.schedule('probe', 300, { who: 'ana' }))
  withWorld(ben.account.id, () => scheduler.schedule('probe', 300, { who: 'ben' }))
  closeWorld(ana.account.id) // a closed world opens again when its job is due
  scheduler.startScheduler(handlers)
  for (let waited = 0; ran.length < 2 && waited < 5000; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100))
  scheduler.stopScheduler()
  assert.deepEqual(ran.sort(), [[ana.account.id, 'ana'], [ben.account.id, 'ben']].sort())
})

test('web sign-in uses an HttpOnly cookie, and signing out ends it', async () => {
  const login = await fetch(`${base}/auth/dev`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'cleo@example.com', name: 'Cleo', platform: 'web' }),
  })
  const body = (await login.json()) as { token?: string; account: SignedInAccount }
  assert.equal(body.token, undefined, 'the web never sees the token')
  const setCookie = login.headers.get('set-cookie') ?? ''
  assert.match(setCookie, /^aura_session=[\w-]+;/)
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Lax/)
  assert.doesNotMatch(setCookie, /Secure/, 'plain http while testing locally')
  const cookie = setCookie.split(';')[0]

  const session = (await (await fetch(`${base}/api/session`, { headers: { cookie } })).json()) as Session
  assert.equal(session.account?.email, 'cleo@example.com')

  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie, origin: base } })
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get('set-cookie') ?? '', /aura_session=;/, 'the cookie is cleared')
  assert.equal((await fetch(`${base}/api/settings`, { headers: { cookie } })).status, 401, 'the old cookie no longer works')
})

test('signing out with a Bearer token ends only that session, and its live stream', { timeout: 10_000 }, async () => {
  const phone = await devLogin('ben@example.com', 'Ben Okafor')
  const phoneStream = await openStream(phone)
  const otherStream = await openStream(ben)
  assert.equal((await phoneStream.next()).type, 'hello')
  assert.equal((await otherStream.next()).type, 'hello')

  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${phone.token}` } })
  assert.equal(logout.status, 200)
  await assert.rejects(phoneStream.next(), /the stream ended/, "the signed-out phone's stream ends")
  assert.equal((await call(phone, 'GET', '/settings')).status, 401)
  assert.equal((await call(ben, 'GET', '/settings')).status, 200, "Ben's other session still works")
  assert.equal(await otherStream.nextWithin(300), null, 'and its stream stays open')
  otherStream.close()
})

test('Google sign-in explains itself when it is not set up', async () => {
  const web = await fetch(`${base}/auth/google?platform=web`, { redirect: 'manual' })
  assert.equal(web.status, 302)
  assert.equal(web.headers.get('location'), '/signin?error=setup')
  const ios = await fetch(`${base}/auth/google?platform=ios`, { redirect: 'manual' })
  assert.equal(ios.headers.get('location'), 'aura://auth?error=setup')
})
