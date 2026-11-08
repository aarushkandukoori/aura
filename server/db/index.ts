/**
 * The database: one SQLite file, opened with Node's built-in `node:sqlite` (no native add-ons).
 *
 * Usage:
 *   q('SELECT * FROM posts WHERE id = ?').get(id)       // one row or undefined
 *   q('SELECT * FROM posts WHERE author_id = ?').all(id) // array of rows
 *   q('UPDATE posts SET like_count = ? WHERE id = ?').run(n, id)
 *   tx(() => { ...several writes that must all happen together... })
 *
 * SQLite has no booleans: pass 1/0 (use bit(x)), never true/false (node:sqlite throws on booleans).
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { config, dbFile, uploadsDir } from '../config.ts'

fs.mkdirSync(config.dataDir, { recursive: true })
fs.mkdirSync(uploadsDir, { recursive: true })

export const db = new DatabaseSync(dbFile)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))

/** Prepared statements are cached by their SQL text, so calling q() in a hot path is cheap. */
const statements = new Map<string, StatementSync>()
export function q(sql: string): StatementSync {
  let statement = statements.get(sql)
  if (!statement) {
    statement = db.prepare(sql)
    statements.set(sql, statement)
  }
  return statement
}

/** Run several writes as one all-or-nothing transaction. Nested calls just join the outer one. */
let depth = 0
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn()
  depth++
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    depth--
  }
}

export const now = () => Date.now()

/** Short random ids with a readable prefix: newId('p') -> "p_Xk3v9QaL". */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('base64url')}`
}

/** true/false -> 1/0 for SQLite. */
export const bit = (value: boolean | number | null | undefined): number => (value ? 1 : 0)

/** Parse a JSON column, falling back when it is empty or broken. */
export function parseJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== 'string' || text === '') return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

// ----- settings: a tiny key/value store for things like the tier, speed and model -----

export function getSetting<T>(key: string, fallback: T): T {
  const row = q('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row ? parseJson<T>(row.value, fallback) : fallback
}

export function setSetting(key: string, value: unknown): void {
  q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value))
}

/** Delete every row in every table (Settings > Start over). Uploaded files are left on disk. */
export function wipeAll(): void {
  tx(() => {
    for (const table of [
      'jobs', 'memories', 'notifications', 'messages', 'conversations', 'highlights', 'story_views',
      'stories', 'comments', 'post_likes', 'posts', 'accounts', 'settings',
    ]) {
      db.exec(`DELETE FROM ${table}`)
    }
  })
}
