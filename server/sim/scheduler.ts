/**
 * The scheduler: the simulation's to-do list, kept in the `jobs` table.
 *
 * schedule('post_wave', 5000, { postId }) means "in 5 seconds, run the post_wave handler with
 * this payload". A timer ticks every second, claims the jobs that are due and runs them. Because
 * jobs live in the database, a restart picks up exactly where the world left off.
 *
 * A job is pending -> running -> done. If its handler throws it gets two more tries a little later,
 * then it is marked failed. A job whose kind has no handler fails right away (nothing crashes).
 */
import { now, parseJson, q } from '../db/index.ts'

/**
 * A job handler. The payload comes back from JSON, so TypeScript can't check it here: each
 * handler names the payload shape it expects in its own signature.
 */
type Handler = (payload: any) => void | Promise<void>
export type Handlers = Record<string, Handler>

type JobRow = {
  id: number
  run_at: number
  kind: string
  payload: string
  state: 'pending' | 'running' | 'done' | 'failed'
  attempts: number
  created_at: number
}

const TICK_MS = 1_000
/** The first run plus two retries. */
export const MAX_ATTEMPTS = 3
/** At most this many jobs start per tick, so one huge backlog can't freeze the server. */
const BATCH_SIZE = 40
/** Finished jobs are kept a day for debugging, then deleted. */
const KEEP_FINISHED_MS = 24 * 60 * 60 * 1000

/** Add a job that runs `delayMs` from now. Returns its id. */
export function schedule(kind: string, delayMs: number, payload: object = {}): number {
  const time = now()
  const result = q('INSERT INTO jobs (run_at, kind, payload, created_at) VALUES (?, ?, ?, ?)')
    .run(time + Math.max(0, Math.round(delayMs)), kind, JSON.stringify(payload), time)
  return Number(result.lastInsertRowid)
}

/** Is a job of this kind waiting? Optionally only one whose payload has `field` = `value`. */
export function hasPending(kind: string, field?: string, value?: string): boolean {
  const row = field
    ? q(`SELECT 1 FROM jobs WHERE kind = ? AND state IN ('pending', 'running')
         AND json_extract(payload, '$.' || ?) = ? LIMIT 1`).get(kind, field, value ?? null)
    : q("SELECT 1 FROM jobs WHERE kind = ? AND state IN ('pending', 'running') LIMIT 1").get(kind)
  return row !== undefined
}

/**
 * Move a waiting job (matched by one payload field) to run no earlier than `runAt`.
 * Used to debounce: several quick messages get one answer. Returns false if none was waiting.
 */
export function postpone(kind: string, field: string, value: string, runAt: number): boolean {
  const result = q(`UPDATE jobs SET run_at = MAX(run_at, ?)
    WHERE kind = ? AND state = 'pending' AND json_extract(payload, '$.' || ?) = ?`).run(runAt, kind, field, value)
  return Number(result.changes) > 0
}

/** Set one payload field on every waiting job of a kind that matches another field. */
export function updatePending(kind: string, match: [field: string, value: string], set: [field: string, value: number]): void {
  q(`UPDATE jobs SET payload = json_set(payload, '$.' || ?, ?)
     WHERE kind = ? AND state = 'pending' AND json_extract(payload, '$.' || ?) = ?`)
    .run(set[0], set[1], kind, match[0], match[1])
}

/**
 * The speed setting changed: waiting jobs that run on sim time get closer (or further away) by
 * `ratio` (new factor / old factor). Chat jobs run on real time and are left alone.
 */
export function rescalePending(ratio: number, realTimeKinds: readonly string[]): void {
  const time = now()
  const rows = q("SELECT id, kind, run_at FROM jobs WHERE state = 'pending' AND run_at > ?")
    .all(time) as Pick<JobRow, 'id' | 'kind' | 'run_at'>[]
  for (const row of rows) {
    if (realTimeKinds.includes(row.kind)) continue
    q('UPDATE jobs SET run_at = ? WHERE id = ?').run(time + Math.round((row.run_at - time) * ratio), row.id)
  }
}

/** Is a job of this kind waiting to start? Unlike hasPending, one that is already running doesn't count. */
export function hasWaiting(kind: string): boolean {
  return q("SELECT 1 FROM jobs WHERE kind = ? AND state = 'pending' LIMIT 1").get(kind) !== undefined
}

/**
 * On startup: jobs that were running when the server stopped get another go. A job that already
 * used all its tries is marked failed instead: it may be what crashed the server, and running it
 * again on every start would crash it again and again.
 */
export function recoverJobs(): void {
  q("UPDATE jobs SET state = 'failed' WHERE state = 'running' AND attempts >= ?").run(MAX_ATTEMPTS)
  q("UPDATE jobs SET state = 'pending' WHERE state = 'running'").run()
}

function purgeFinishedJobs(): void {
  q("DELETE FROM jobs WHERE state IN ('done', 'failed') AND run_at < ?").run(now() - KEEP_FINISHED_MS)
}

function finish(id: number, state: 'done' | 'failed'): void {
  q('UPDATE jobs SET state = ? WHERE id = ?').run(state, id)
}

/** Run one claimed job. Errors never escape: they turn into a retry or a failed job. */
async function runJob(job: JobRow, handlers: Handlers): Promise<void> {
  const handler = handlers[job.kind]
  if (!handler) {
    console.warn(`[sim] no handler for job "${job.kind}" (#${job.id}), marking it failed`)
    finish(job.id, 'failed')
    return
  }
  const attempt = job.attempts + 1 // the claim already counted this run
  try {
    await handler(parseJson<Record<string, unknown>>(job.payload, {}))
    finish(job.id, 'done')
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS) {
      console.error(`[sim] job "${job.kind}" (#${job.id}) failed for good:`, error)
      finish(job.id, 'failed')
    } else {
      console.warn(`[sim] job "${job.kind}" (#${job.id}) failed, retrying: ${(error as Error).message}`)
      q("UPDATE jobs SET state = 'pending', run_at = ? WHERE id = ?").run(now() + attempt * 5_000, job.id)
    }
  }
}

/**
 * Start every job that is due at time `at`. Handlers are not awaited here, so a slow AI call
 * never holds up the tick; the returned promises let tests wait for them.
 */
export function runDueJobs(handlers: Handlers, at = now()): Promise<void>[] {
  const due = q("SELECT * FROM jobs WHERE state = 'pending' AND run_at <= ? ORDER BY run_at, id LIMIT ?")
    .all(at, BATCH_SIZE) as JobRow[]
  const started: Promise<void>[] = []
  for (const job of due) {
    // Claim it first (pending -> running), so a job can never start twice.
    const claimed = q("UPDATE jobs SET state = 'running', attempts = attempts + 1 WHERE id = ? AND state = 'pending'").run(job.id)
    if (Number(claimed.changes) === 1) started.push(runJob(job, handlers))
  }
  return started
}

let timer: ReturnType<typeof setInterval> | null = null
let lastPurge = 0

/** Start ticking once a second. Safe to call twice. */
export function startScheduler(handlers: Handlers): void {
  if (timer) return
  recoverJobs()
  timer = setInterval(() => {
    try {
      runDueJobs(handlers)
      if (now() - lastPurge > 60 * 60 * 1000) {
        lastPurge = now()
        purgeFinishedJobs()
      }
    } catch (error) {
      console.error('[sim] tick failed:', error)
    }
  }, TICK_MS)
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
