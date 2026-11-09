/**
 * Sign in with Google: OAuth 2.0's authorization-code flow with PKCE, using plain fetch (no SDK).
 *
 * 1. GET /auth/google?platform=web|ios sends the browser to Google's account chooser. A random
 *    `state` and a random PKCE secret (the "verifier") go into a short-lived cookie.
 * 2. Google sends the browser back to GET /auth/google/callback?code=...&state=...
 * 3. `state` must match the cookie, so nobody can make you finish a sign-in they started. The
 *    code and the verifier are swapped for an access token, which reads the account from Google.
 * 4. The account gets a user (and with it its own world) and a session: the web gets the session
 *    cookie and goes into the app; the iPhone app's sign-in sheet gets aura://auth?token=<token>.
 *
 * Only the openid, email and profile scopes are asked for, so the consent screen can be
 * published without Google's app review.
 */
import crypto from 'node:crypto'
import { Router, type Response } from 'express'
import { config } from '../config.ts'
import { saveUser } from '../db/accounts.ts'
import { readCookie, secureCookies, startSession } from './sessions.ts'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

/** The cookie that remembers one sign-in in progress, for 10 minutes, only on /auth/google paths. */
const FLOW_COOKIE = 'aura_oauth'
const FLOW_COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/auth/google' } as const

type AppPlatform = 'web' | 'ios'
interface Flow { state: string; verifier: string; platform: AppPlatform; next: string }
interface GoogleProfile { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string }

const randomText = (bytes: number) => crypto.randomBytes(bytes).toString('base64url')
const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('base64url')
const redirectUri = () => `${config.publicUrl}/auth/google/callback`

export const googleRoutes = Router()

googleRoutes.get('/auth/google', (req, res) => {
  const platform: AppPlatform = req.query.platform === 'ios' ? 'ios' : 'web'
  if (!config.google) return finish(res, platform, { error: 'setup' })
  // Start on the public address: the flow cookie must be there when Google sends the browser back.
  if (req.headers.host?.toLowerCase() !== new URL(config.publicUrl).host) return res.redirect(config.publicUrl + req.originalUrl)

  const flow: Flow = { state: randomText(16), verifier: randomText(32), platform, next: safeNext(req.query.next) }
  res.cookie(FLOW_COOKIE, Buffer.from(JSON.stringify(flow)).toString('base64url'), { ...FLOW_COOKIE_OPTIONS, maxAge: 10 * 60_000 })
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state: flow.state,
    code_challenge: sha256(flow.verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account', // let people pick which Google account (each one has its own world)
  })
  res.redirect(`${GOOGLE_AUTH_URL}?${params}`)
})

googleRoutes.get('/auth/google/callback', async (req, res) => {
  const flow = readFlow(readCookie(req, FLOW_COOKIE))
  res.clearCookie(FLOW_COOKIE, FLOW_COOKIE_OPTIONS)
  const platform = flow?.platform ?? 'web'
  if (!config.google) return finish(res, platform, { error: 'setup' })
  if (req.query.error) return finish(res, platform, { error: 'cancelled' }) // e.g. "access_denied"

  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  if (!flow || !code || !sameText(state, flow.state)) return finish(res, platform, { error: 'expired' })

  let profile: GoogleProfile
  try {
    profile = await fetchProfile(config.google, code, flow.verifier)
  } catch (error) {
    console.warn(`[auth] Google sign-in failed: ${(error as Error).message}`)
    return finish(res, platform, { error: 'google' })
  }
  if (!profile.sub || !profile.email || profile.email_verified === false) return finish(res, platform, { error: 'unverified' })

  const user = saveUser({
    googleSub: profile.sub,
    email: profile.email,
    name: profile.name?.trim() || profile.email.split('@')[0],
    picture: profile.picture ?? null,
  })
  const token = startSession(res, user.id, platform)
  finish(res, platform, { token }, flow.next)
})

/** Swap the one-time code for an access token, then read the account it belongs to. */
async function fetchProfile(google: { clientId: string; clientSecret: string }, code: string, verifier: string): Promise<GoogleProfile> {
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const tokens = (await tokenResponse.json().catch(() => ({}))) as { access_token?: string; error?: string }
  if (!tokenResponse.ok || !tokens.access_token) throw new Error(`token exchange answered ${tokenResponse.status} ${tokens.error ?? ''}`)

  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!profileResponse.ok) throw new Error(`userinfo answered ${profileResponse.status}`)
  return (await profileResponse.json()) as GoogleProfile
}

/**
 * Send the browser on. Web: into the app (or back to the sign-in page with an error code it can
 * explain). iPhone: to aura://auth, which closes the app's sign-in sheet and hands it the result.
 */
function finish(res: Response, platform: AppPlatform, result: { token?: string; error?: string }, next = '/'): void {
  res.setHeader('Cache-Control', 'no-store')
  if (platform === 'ios') {
    const query = result.token ? `token=${encodeURIComponent(result.token)}` : `error=${result.error}`
    return res.redirect(`aura://auth?${query}`)
  }
  res.redirect(result.error ? `/signin?error=${result.error}` : next)
}

/** The page to open after signing in: a path on this site ("/p/123"), never another website. */
function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  if (value.length > 300 || value.startsWith('/signin')) return '/'
  return value
}

/** The flow cookie back as an object, or null when it is missing, expired or not ours. */
function readFlow(cookie: string | null): Flow | null {
  if (!cookie) return null
  try {
    const flow = JSON.parse(Buffer.from(cookie, 'base64url').toString('utf8')) as Partial<Flow>
    if (typeof flow.state !== 'string' || typeof flow.verifier !== 'string') return null
    return { state: flow.state, verifier: flow.verifier, platform: flow.platform === 'ios' ? 'ios' : 'web', next: safeNext(flow.next) }
  } catch {
    return null
  }
}

/** Compare two secrets in constant time, so response timing gives nothing away. */
function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}
