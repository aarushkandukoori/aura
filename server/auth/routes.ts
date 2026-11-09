/**
 * The sign-in routes, mounted at the root of the app (outside /api's world middleware):
 *   GET  /auth/google, /auth/google/callback   Sign in with Google (google.ts)
 *   POST /auth/dev                             Tests only (AURA_DEV_LOGIN=1): sign in as any email
 *   POST /api/auth/logout                      Sign out on this device
 */
import path from 'node:path'
import { Router } from 'express'
import { badRequest, body, HttpError, text } from '../api/http.ts'
import { authEnabled, config } from '../config.ts'
import { saveUser, toSignedInAccount, type Platform } from '../db/accounts.ts'
import { googleRoutes } from './google.ts'
import { endSession, startSession } from './sessions.ts'

export function authRoutes(): Router {
  const router = Router()
  router.use(googleRoutes)

  /**
   * Test sign-in without Google, for scripts and automated tests. Answers like a Google sign-in:
   * { platform: 'web' } gets the session cookie, anything else gets { token } to send as a Bearer header.
   */
  router.post('/auth/dev', (req, res) => {
    if (!config.devLogin) throw new HttpError(404, 'Not found')
    const input = body(req)
    const email = text(input.email, 'email', { min: 3, max: 200 }).toLowerCase()
    if (!email.includes('@')) throw badRequest('email must be an email address')
    const name = input.name === undefined ? email.split('@')[0] : text(input.name, 'name', { min: 1, max: 80 })
    const platform: Platform = input.platform === 'web' || input.platform === 'ios' ? input.platform : 'script'
    const user = saveUser({ googleSub: `dev:${email}`, email, name, picture: null })
    const token = startSession(res, user.id, platform)
    const account = toSignedInAccount(user)
    res.json(platform === 'web' ? { account } : { token, account })
  })

  router.post('/api/auth/logout', (req, res) => {
    endSession(req, res)
    res.json({ ok: true })
  })
  return router
}

/** One line for the startup log saying how people get in. */
export function describeSignIn(): string {
  if (!authEnabled) return `off (local mode: one world in ${path.relative(process.cwd(), path.join(config.dataDir, 'aura.db'))})`
  const ways = [config.google ? `Google (sends people back to ${config.publicUrl})` : null, config.devLogin ? 'dev login' : null]
  return `on · ${ways.filter(Boolean).join(' + ')} · a separate world per account`
}

/** Startup warnings for sign-in set up in a way that would hurt later. */
export function warnAboutSignInSetup(): void {
  // Without it Google sends people back to localhost, and requests for the real address are refused.
  if (config.google && !process.env.AURA_PUBLIC_URL && config.host !== '127.0.0.1') {
    console.warn(`[auth] AURA_PUBLIC_URL is not set, so Google sign-in returns people to ${config.publicUrl}. `
      + 'Set it to the address people open, like https://aura.example.com.')
  }
  // The dev login lets anyone sign in as anyone, so it must never be switched on by accident.
  if (config.devLogin) {
    const line = '!'.repeat(78)
    console.warn(`${line}\n!! AURA_DEV_LOGIN=1: POST /auth/dev signs ANYONE in as ANY email, no password.\n`
      + `!! Only for tests. Never set it on a server other people can reach.\n${line}`)
  }
}
