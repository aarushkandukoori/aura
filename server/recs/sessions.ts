/**
 * Scroll sessions: stable paging for ranked lists.
 *
 * Loading page one of the feed (or Explore, or Reels) starts a session. Its cursor names the
 * session and the next page number. The session remembers every post it served, so later pages
 * never repeat one, and every page it built, so asking for the same page twice (a retry) gives the
 * same answer. Each new page is ranked with the newest signals: like three coffee posts on page
 * one and page two already has more coffee.
 *
 * Sessions live in memory, per world. After a restart an old cursor simply starts a fresh session;
 * posts that were on screen are ranked low anyway (the seen penalty), and the apps skip repeats.
 */
import crypto from 'node:crypto'
import { worldState } from '../db/index.ts'
import { decodeCursor, encodeCursor } from '../repo/paging.ts'
import { emptyHistory, type History } from './score.ts'

export interface ScrollSession {
  id: string
  surface: string
  createdAt: number
  /** Every post id served so far. */
  served: Set<string>
  /** Each page served, by page number (1 = the first page), and whether more came after it. */
  pages: Map<number, { ids: string[]; more: boolean }>
  /** What the session showed so far, for variety across pages (page n+1 doesn't start with the author that ended page n). */
  history: History
  /** Surface-specific counters (the feed counts followed posts since its last suggestion). */
  counters: Record<string, number>
  /** Why each suggested post was picked, kept so a repeated page has the same labels. */
  reasons: Map<string, string>
}

/** A session is forgotten after two hours, and a world keeps at most 30 (the oldest go first). */
const SESSION_MS = 2 * 60 * 60 * 1000
const MAX_SESSIONS = 30

const sessions = worldState(() => new Map<string, ScrollSession>())

/** Start over: the old world's scroll sessions point at posts that are gone. */
export function forgetSessions(): void {
  sessions().clear()
}

function newSession(id: string, surface: string, now: number): ScrollSession {
  const all = sessions()
  for (const [key, session] of all) {
    if (now - session.createdAt > SESSION_MS) all.delete(key)
  }
  while (all.size >= MAX_SESSIONS) all.delete(all.keys().next().value as string)
  const session: ScrollSession = { id, surface, createdAt: now, served: new Set(), pages: new Map(), history: emptyHistory(), counters: {}, reasons: new Map() }
  all.set(id, session)
  return session
}

/**
 * The session and page number a cursor points at. No cursor (or a broken one) starts a new
 * session at page 1. `key` separates lists that page independently (each Explore topic).
 */
export function openSession(cursor: string | null, key: string, now = Date.now()): { session: ScrollSession; page: number } {
  const saved = decodeCursor<{ s?: unknown; p?: unknown }>(cursor)
  const id = typeof saved?.s === 'string' && /^[\w-]{6,24}$/.test(saved.s) ? saved.s : null
  const page = typeof saved?.p === 'number' && Number.isInteger(saved.p) && saved.p >= 1 && saved.p <= 500 ? saved.p : 1
  if (!id) return { session: newSession(crypto.randomBytes(9).toString('base64url'), key, now), page: 1 }
  const existing = sessions().get(id)
  // A cursor from another list, or from before a restart, starts over under the same id.
  if (!existing || existing.surface !== key) return { session: newSession(id, key, now), page }
  return { session: existing, page }
}

/** The cursor for the page after `page`. */
export function nextCursor(session: ScrollSession, page: number): string {
  return encodeCursor({ s: session.id, p: page + 1 })
}

/** Remember a served page. */
export function rememberPage(session: ScrollSession, page: number, ids: string[], more: boolean): void {
  session.pages.set(page, { ids, more })
  for (const id of ids) session.served.add(id)
}
