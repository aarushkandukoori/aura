/**
 * Where the recommendation algorithm keeps what it learned, in three tables of each world's
 * database (made with defineTable, so every world has its own and Start over empties them):
 *
 *   rec_events  every signal: what the user did, to what, and how much it counted (newest 20,000)
 *   rec_scores  how much the user likes each account and topic, and how often they saw each topic,
 *               as decayed scores (see decay.ts): kind 'account' | 'topic' | 'exposure'
 *   rec_seen    per post: how many times it was on screen, for how long, reels watched to the end
 */
import { defineTable, q } from '../db/index.ts'
import { addEvent, valueAt, type Decayed } from './decay.ts'

defineTable('rec_events', `CREATE TABLE IF NOT EXISTS rec_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,     -- 'like', 'impression', 'reel_watch', 'search'...
  post_id    TEXT,
  account_id TEXT,
  topics     TEXT,              -- JSON list of the topics it counted for
  ms         INTEGER,           -- time on screen (impressions, reels, stories)
  weight     REAL NOT NULL,     -- how much it said "I like this" (negative = "not for me")
  at         INTEGER NOT NULL
)`)

defineTable('rec_scores', `CREATE TABLE IF NOT EXISTS rec_scores (
  kind  TEXT NOT NULL,          -- 'account' | 'topic' | 'exposure'
  key   TEXT NOT NULL,          -- account id or topic
  value REAL NOT NULL,          -- the score as of "at" (it halves every 3 days after that)
  at    INTEGER NOT NULL,
  PRIMARY KEY (kind, key)
)`)

defineTable('rec_seen', `CREATE TABLE IF NOT EXISTS rec_seen (
  post_id   TEXT PRIMARY KEY,
  views     INTEGER NOT NULL DEFAULT 0, -- times it was on screen (or watched, for reels)
  ms        INTEGER NOT NULL DEFAULT 0, -- total time on screen
  completes INTEGER NOT NULL DEFAULT 0, -- reels watched to the end
  last_at   INTEGER NOT NULL
)`)

export type ScoreKind = 'account' | 'topic' | 'exposure'

/** No score grows past this (or below minus this), so one obsession can't drown out everything. */
const SCORE_LIMIT = 60
/** The events log keeps the newest rows only: enough to explain recent choices, never a growing file. */
const KEEP_EVENTS = 20_000

// ----- writing --------------------------------------------------------------------------------

/** Add `weight` (at time `at`) to one score. */
export function bumpScore(kind: ScoreKind, key: string, weight: number, at: number): void {
  if (weight === 0 || !key) return
  const row = q('SELECT value, at FROM rec_scores WHERE kind = ? AND key = ?').get(kind, key) as Decayed | undefined
  const next = addEvent(row ?? null, weight, at)
  const value = Math.max(-SCORE_LIMIT, Math.min(SCORE_LIMIT, next.value))
  q(`INSERT INTO rec_scores (kind, key, value, at) VALUES (?, ?, ?, ?)
     ON CONFLICT(kind, key) DO UPDATE SET value = excluded.value, at = excluded.at`).run(kind, key, value, next.at)
}

/** A post was on screen (or a reel was watched) for `ms`. */
export function markSeen(postId: string, ms: number, complete: boolean, at: number): void {
  q(`INSERT INTO rec_seen (post_id, views, ms, completes, last_at) VALUES (?, 1, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET views = views + 1, ms = ms + excluded.ms,
       completes = completes + excluded.completes, last_at = MAX(last_at, excluded.last_at)`)
    .run(postId, Math.round(ms), complete ? 1 : 0, at)
}

export interface LoggedEvent {
  type: string
  postId: string | null
  accountId: string | null
  topics: string[]
  ms: number | null
  weight: number
  at: number
}

export function logEvent(event: LoggedEvent): void {
  q('INSERT INTO rec_events (type, post_id, account_id, topics, ms, weight, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    event.type, event.postId, event.accountId, event.topics.length > 0 ? JSON.stringify(event.topics) : null,
    event.ms === null ? null : Math.round(event.ms), event.weight, event.at,
  )
}

/** Drop all but the newest KEEP_EVENTS events (one quick statement; run after each batch). */
export function pruneEvents(): void {
  q('DELETE FROM rec_events WHERE id <= (SELECT MAX(id) FROM rec_events) - ?').run(KEEP_EVENTS)
}

/** A rec_events row as stored. */
type EventRow = { type: string; post_id: string | null; account_id: string | null; topics: string | null; ms: number | null; weight: number; at: number }

function toLogged(row: EventRow): LoggedEvent {
  return {
    type: row.type,
    postId: row.post_id,
    accountId: row.account_id,
    topics: row.topics ? (JSON.parse(row.topics) as string[]) : [],
    ms: row.ms,
    weight: row.weight,
    at: row.at,
  }
}

/** The newest event of a type about a post or an account (to take back a like when it is undone). */
export function lastEvent(type: string, target: { postId?: string; accountId?: string }): LoggedEvent | null {
  const row = (target.postId
    ? q('SELECT * FROM rec_events WHERE type = ? AND post_id = ? ORDER BY id DESC LIMIT 1').get(type, target.postId)
    : q('SELECT * FROM rec_events WHERE type = ? AND account_id = ? ORDER BY id DESC LIMIT 1').get(type, target.accountId ?? '')) as
    EventRow | undefined
  return row ? toLogged(row) : null
}

// ----- reading --------------------------------------------------------------------------------

/** Every score of the current world, worth what it is worth right now. */
export function readScores(now: number): Record<ScoreKind, Map<string, number>> {
  const scores: Record<ScoreKind, Map<string, number>> = { account: new Map(), topic: new Map(), exposure: new Map() }
  const rows = q('SELECT kind, key, value, at FROM rec_scores').all() as { kind: ScoreKind; key: string; value: number; at: number }[]
  for (const row of rows) scores[row.kind]?.set(row.key, valueAt(row, now))
  return scores
}

export interface Seen {
  views: number
  ms: number
  completes: number
  lastAt: number
}

/** What the user has already seen, by post id. */
export function readSeen(): Map<string, Seen> {
  const rows = q('SELECT post_id, views, ms, completes, last_at FROM rec_seen').all() as
    { post_id: string; views: number; ms: number; completes: number; last_at: number }[]
  return new Map(rows.map((row) => [row.post_id, { views: row.views, ms: row.ms, completes: row.completes, lastAt: row.last_at }]))
}

/** The newest events, newest first (tests and debugging: "why did I see this?"). */
export function recentEvents(limit = 50): LoggedEvent[] {
  return (q('SELECT * FROM rec_events ORDER BY id DESC LIMIT ?').all(limit) as EventRow[]).map(toLogged)
}
