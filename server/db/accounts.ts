/**
 * The accounts database (data/accounts.db): the people who sign in with Google, their sessions
 * (one per signed-in browser or phone), and counters shared by every world. Only used when
 * sign-in is on; local mode never creates it. Tables are described in accounts.sql.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import type { SignedInAccount } from '../../shared/types.ts'
import { config } from '../config.ts'
import { newId } from './index.ts'

/** A session lasts this long after it was last used, so people who keep coming back stay signed in. */
export const SESSION_DAYS = 90
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

let db: DatabaseSync | null = null
const statements = new Map<string, StatementSync>()

/** A prepared statement on the accounts database, which opens the first time it is needed. */
function sql(text: string): StatementSync {
  if (!db) {
    fs.mkdirSync(config.dataDir, { recursive: true })
    db = new DatabaseSync(path.join(config.dataDir, 'accounts.db'))
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
    db.exec(fs.readFileSync(new URL('./accounts.sql', import.meta.url), 'utf8'))
  }
  let statement = statements.get(text)
  if (!statement) {
    statement = db.prepare(text)
    statements.set(text, statement)
  }
  return statement
}

/** Close the accounts database (tests and shutdown). It opens again when used. */
export function closeAccounts(): void {
  db?.close()
  db = null
  statements.clear()
}

// ----- users ------------------------------------------------------------------------------------

export interface UserRow {
  id: string
  google_sub: string
  email: string
  name: string
  picture: string | null
  created_at: number
  last_seen_at: number
}

/** Someone signed in: create their user the first time, and keep their name and photo up to date after that. */
export function saveUser(profile: { googleSub: string; email: string; name: string; picture: string | null }): UserRow {
  const time = Date.now()
  sql(`INSERT INTO users (id, google_sub, email, name, picture, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture,
       last_seen_at = excluded.last_seen_at`)
    .run(newId('u'), profile.googleSub, profile.email, profile.name, profile.picture, time, time)
  return sql('SELECT * FROM users WHERE google_sub = ?').get(profile.googleSub) as unknown as UserRow
}

export function getUser(id: string): UserRow | undefined {
  return sql('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}

export function toSignedInAccount(user: UserRow): SignedInAccount {
  return { id: user.id, email: user.email, name: user.name, picture: user.picture }
}

// ----- sessions ---------------------------------------------------------------------------------

export type Platform = 'web' | 'ios' | 'script'

/** The SHA-256 of a session token: what the database stores, and the key live streams are filed under. */
export const hashOf = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

/** Start a session. Returns the token the app keeps; only its hash is stored. */
export function createSession(userId: string, platform: Platform): string {
  const token = crypto.randomBytes(32).toString('base64url')
  const time = Date.now()
  sql('INSERT INTO sessions (token_hash, user_id, platform, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(hashOf(token), userId, platform, time, time, time + SESSION_DAYS * DAY_MS)
  return token
}

export interface FoundSession {
  userId: string
  platform: Platform
  /** true when this use pushed the expiry out again (the web then refreshes its cookie too). */
  renewed: boolean
}

/**
 * The session behind a token, or null when it is unknown or expired. Using a session keeps it
 * alive: at most once an hour its 90 days start over and the user's last_seen_at moves.
 */
export function findSession(token: string): FoundSession | null {
  const hash = hashOf(token)
  const row = sql('SELECT user_id, platform, last_used_at, expires_at FROM sessions WHERE token_hash = ?').get(hash) as
    { user_id: string; platform: Platform; last_used_at: number; expires_at: number } | undefined
  if (!row) return null
  const time = Date.now()
  if (row.expires_at <= time) {
    sql('DELETE FROM sessions WHERE token_hash = ?').run(hash)
    return null
  }
  const renewed = time - row.last_used_at > HOUR_MS
  if (renewed) {
    sql('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?').run(time, time + SESSION_DAYS * DAY_MS, hash)
    sql('UPDATE users SET last_seen_at = ? WHERE id = ?').run(time, row.user_id)
  }
  return { userId: row.user_id, platform: row.platform, renewed }
}

/** Sign out: the token stops working. */
export function deleteSession(token: string): void {
  sql('DELETE FROM sessions WHERE token_hash = ?').run(hashOf(token))
}

// ----- counters shared by every world -------------------------------------------------------------

const today = () => new Date().toDateString()

/** Today's value of a shared counter, like 'ai_calls'. */
export function dailyCount(name: string): number {
  const row = sql('SELECT count FROM daily_counts WHERE name = ? AND day = ?').get(name, today()) as { count: number } | undefined
  return row?.count ?? 0
}

/** Add one to a shared counter for today. Returns the new value. */
export function bumpDailyCount(name: string): number {
  sql(`INSERT INTO daily_counts (name, day, count) VALUES (?, ?, 1)
       ON CONFLICT(name, day) DO UPDATE SET count = count + 1`).run(name, today())
  return dailyCount(name)
}

/** At startup: forget expired sessions and the counters of earlier days. */
export function cleanUpAccounts(): void {
  sql('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  sql('DELETE FROM daily_counts WHERE day <> ?').run(today())
}
