/**
 * Who is calling? A signed-in app sends the session token it got at sign-in:
 * - the web app in the aura_session cookie (HttpOnly, so scripts on the page can't read it),
 * - the iPhone app in an "Authorization: Bearer <token>" header, on every request including the
 *   live stream and uploads.
 *
 * enterWorld runs the rest of each API request inside the caller's world (server/db/index.ts).
 * A signed-out request goes on with no world, and every route that needs one answers 401
 * (requireSignIn in server/api/http.ts). Local mode has no sign-in: every request uses the local world.
 */
import type { Request, RequestHandler, Response } from 'express'
import { authEnabled, config } from '../config.ts'
import { createSession, deleteSession, findSession, hashOf, SESSION_DAYS, type Platform } from '../db/accounts.ts'
import { LOCAL_WORLD, withWorld } from '../db/index.ts'
import { closeSessionStreams } from '../live.ts'

export const SESSION_COOKIE = 'aura_session'

/** Cookies only travel over https when the public address is https; plain http still works for local testing. */
export const secureCookies = config.publicUrl.startsWith('https://')

const DAY_MS = 24 * 60 * 60 * 1000

/** One cookie's value from the Cookie header, or null. */
export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

/** The session token a request carries: the Authorization header first, then the cookie. */
export function tokenOf(req: Request): string | null {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim() || null
  return readCookie(req, SESSION_COOKIE)
}

/** A key for the request's session that is safe to keep in memory (a hash, never the token). Null without one. */
export function sessionKeyOf(req: Request): string | null {
  const token = tokenOf(req)
  return token ? hashOf(token) : null
}

/** The web's session cookie: HttpOnly, sent on same-site requests and top-level visits only (SameSite=Lax). */
function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/', maxAge: SESSION_DAYS * DAY_MS,
  })
}

/** Sign a user in on this device. The web gets the cookie; the iPhone app and scripts get the token to keep. */
export function startSession(res: Response, userId: string, platform: Platform): string {
  const token = createSession(userId, platform)
  if (platform === 'web') setSessionCookie(res, token)
  return token
}

/** Sign out on this device: the token stops working, its live streams end and the web cookie is removed. */
export function endSession(req: Request, res: Response): void {
  const token = tokenOf(req)
  if (token) {
    deleteSession(token)
    closeSessionStreams(hashOf(token))
  }
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/' })
}

/** Middleware: the rest of the request runs inside the caller's world (no world when signed out). */
export const enterWorld: RequestHandler = (req, res, next) => {
  if (!authEnabled) return withWorld(LOCAL_WORLD, next)
  const token = tokenOf(req)
  const session = token ? findSession(token) : null
  if (!token || !session) return next()
  // Using a session keeps it alive for another 90 days; the web cookie gets the same new expiry.
  if (session.renewed && session.platform === 'web') setSessionCookie(res, token)
  withWorld(session.userId, next)
}
