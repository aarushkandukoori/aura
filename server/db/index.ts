/**
 * The world databases. Every world is its own SQLite file, opened with Node's built-in
 * `node:sqlite` (no native add-ons):
 *
 *   local mode (no sign-in)   data/aura.db + data/uploads: one world, called "local"
 *   Google sign-in            data/worlds/<account id>/aura.db + .../uploads: one world per account
 *
 * Code doesn't say which file it means. A request or a simulation job runs inside
 * withWorld(worldId, fn), and q(), tx(), getSetting()... use that world's database. Node's
 * AsyncLocalStorage carries the world id through every await and timer that fn starts, like a
 * variable that belongs to one piece of work. So one person's request can't touch another's world.
 *
 * Usage (inside a world):
 *   q('SELECT * FROM posts WHERE id = ?').get(id)       // one row or undefined
 *   q('SELECT * FROM posts WHERE author_id = ?').all(id) // array of rows
 *   q('UPDATE posts SET like_count = ? WHERE id = ?').run(n, id)
 *   tx(() => { ...several writes that must all happen together... })
 *
 * SQLite has no booleans: pass 1/0 (use bit(x)), never true/false (node:sqlite throws on booleans).
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { authEnabled, config } from '../config.ts'

/** The one world of local mode. It keeps the paths Aura used before accounts existed. */
export const LOCAL_WORLD = 'local'

/** An open world database. */
interface World {
  db: DatabaseSync
  /** Prepared statements by their SQL text, so calling q() in a hot path is cheap. */
  statements: Map<string, StatementSync>
  /** How deep tx() calls are nested right now (inner ones join the outer transaction). */
  txDepth: number
  lastUsedAt: number
}

const openWorlds = new Map<string, World>()
const currentWorld = new AsyncLocalStorage<string>()
const SCHEMA = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')

// ----- which world? ---------------------------------------------------------------------------

/** World ids become folder names: letters, digits, "_" and "-" only (account ids look like "u_Xk3v9QaL"). */
export function isWorldId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id)
}

/** Run fn, and everything it starts (awaits, timers), inside one world. Returns what fn returns. */
export function withWorld<T>(worldId: string, fn: () => T): T {
  if (!isWorldId(worldId)) throw new Error(`Not a world id: ${JSON.stringify(worldId)}`)
  return currentWorld.run(worldId, fn)
}

/**
 * The world the running code belongs to. Local mode has just one world, so that is the default.
 * With sign-in on there is no default: code that forgot withWorld() fails loudly instead of
 * writing into someone else's world.
 */
export function currentWorldId(): string {
  const id = currentWorld.getStore() ?? (authEnabled ? undefined : LOCAL_WORLD)
  if (!id) throw new Error("No world here: run this code inside withWorld(worldId, ...) so it uses the right account's world")
  return id
}

/** Is there a world to use? Only false with sign-in on, outside withWorld (a signed-out request). */
export function hasWorld(): boolean {
  return currentWorld.getStore() !== undefined || !authEnabled
}

/** Where a world keeps its database and uploads. */
export function worldDir(worldId: string): string {
  return worldId === LOCAL_WORLD ? config.dataDir : path.join(config.dataDir, 'worlds', worldId)
}

export function worldUploadsDir(worldId: string): string {
  return path.join(worldDir(worldId), 'uploads')
}

/** Every world on disk: the local one in local mode, otherwise one folder per account in data/worlds. */
export function knownWorldIds(): string[] {
  if (!authEnabled) return [LOCAL_WORLD]
  const folder = path.join(config.dataDir, 'worlds')
  if (!fs.existsSync(folder)) return []
  return fs.readdirSync(folder)
    .filter((id) => isWorldId(id) && id !== LOCAL_WORLD && fs.existsSync(path.join(folder, id, 'aura.db')))
}

// ----- opening and closing ----------------------------------------------------------------------

/** The current world's database, opened (and its tables created) the first time it is needed. */
function world(): World {
  const id = currentWorldId()
  const open = openWorlds.get(id) ?? openWorld(id)
  open.lastUsedAt = Date.now()
  return open
}

function openWorld(id: string): World {
  const folder = worldDir(id)
  fs.mkdirSync(path.join(folder, 'uploads'), { recursive: true })
  const db = new DatabaseSync(path.join(folder, 'aura.db'))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
  db.exec(SCHEMA)
  for (const table of extraTables) db.exec(table.sql)
  const opened: World = { db, statements: new Map(), txDepth: 0, lastUsedAt: Date.now() }
  openWorlds.set(id, opened)
  watchForIdleWorlds()
  return opened
}

/** A world nobody touched for this long is closed. Using it again simply opens it again. */
const IDLE_MS = 10 * 60 * 1000
let idleTimer: ReturnType<typeof setInterval> | null = null

function watchForIdleWorlds(): void {
  if (idleTimer) return
  // A timer belongs to the world that starts it; this one serves every world, so it starts outside them all.
  idleTimer = currentWorld.exit(() => setInterval(() => {
    for (const [id, open] of openWorlds) {
      if (Date.now() - open.lastUsedAt > IDLE_MS) closeWorld(id)
    }
  }, 60_000))
  idleTimer.unref() // never keeps the process (or a test run) alive
}

/** Close one world's database. Safe at any time: the next q() in that world opens it again. */
export function closeWorld(worldId: string): void {
  const open = openWorlds.get(worldId)
  if (!open) return
  openWorlds.delete(worldId)
  open.db.close()
}

/** Close every open world (tests and shutdown). */
export function closeAllWorlds(): void {
  for (const id of [...openWorlds.keys()]) closeWorld(id)
}

// ----- queries ----------------------------------------------------------------------------------

export function q(sql: string): StatementSync {
  const { db, statements } = world()
  let statement = statements.get(sql)
  if (!statement) {
    statement = db.prepare(sql)
    statements.set(sql, statement)
  }
  return statement
}

/** Run several writes as one all-or-nothing transaction. Nested calls just join the outer one. */
export function tx<T>(fn: () => T): T {
  const open = world()
  if (open.txDepth > 0) return fn()
  open.txDepth++
  open.db.exec('BEGIN')
  try {
    const result = fn()
    open.db.exec('COMMIT')
    return result
  } catch (error) {
    open.db.exec('ROLLBACK')
    throw error
  } finally {
    open.txDepth--
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

/**
 * Memory that belongs to one world, like typing indicators or chat locks. worldState(() => start)
 * returns a function that gives the current world's copy, made with start() the first time.
 */
export function worldState<T>(start: () => T): () => T {
  const byWorld = new Map<string, T>()
  return () => {
    const id = currentWorldId()
    if (!byWorld.has(id)) byWorld.set(id, start())
    return byWorld.get(id) as T
  }
}

// ----- tables beyond schema.sql -----------------------------------------------------------------

const extraTables: { name: string; sql: string }[] = []

/**
 * Keep one more table in every world, for a module whose table isn't in schema.sql. Call it once
 * at the top of that module:
 *   defineTable('events', 'CREATE TABLE IF NOT EXISTS events (...)')
 * The SQL runs in every world when it opens (right away in open ones), and Start over empties it.
 */
export function defineTable(name: string, createSql: string): void {
  if (!/^\w+$/.test(name)) throw new Error(`Bad table name: ${name}`)
  extraTables.push({ name, sql: createSql })
  for (const open of openWorlds.values()) open.db.exec(createSql)
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

/** Delete every row in every table of the current world (Settings > Start over). Uploaded files stay on disk. */
export function wipeAll(): void {
  const { db } = world()
  tx(() => {
    for (const table of [
      ...extraTables.map((extra) => extra.name),
      'jobs', 'memories', 'notifications', 'messages', 'conversations', 'highlights', 'story_views',
      'stories', 'comments', 'post_likes', 'posts', 'accounts', 'settings',
    ]) {
      db.exec(`DELETE FROM ${table}`)
    }
  })
}
