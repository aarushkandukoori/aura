/**
 * Scheduler tests: jobs run when due, are claimed once, retry twice then fail, unknown kinds fail
 * safely, restarts recover running jobs, and the debounce / rescale helpers move jobs correctly.
 * Uses its own temporary database. Run with `npm test`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

// The data folder is read when the database module loads, so set it before importing.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-sim-scheduler-'))
process.env.AURA_DATA_DIR = dataDir
process.env.AURA_PROVIDER = 'offline'
// Local mode (one world, the default outside a request), even if .env sets up sign-in.
delete process.env.GOOGLE_CLIENT_ID
delete process.env.GOOGLE_CLIENT_SECRET
delete process.env.AURA_DEV_LOGIN

const { closeAllWorlds, q } = await import('../db/index.ts')
const scheduler = await import('./scheduler.ts')

after(() => {
  closeAllWorlds()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

type JobRow = { id: number; kind: string; payload: string; state: string; attempts: number; run_at: number }
const job = (id: number) => q('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow

test('a job waits until it is due, then runs once with its payload', async () => {
  const id = scheduler.schedule('ping', 60_000, { n: 1 })
  assert.equal(job(id).state, 'pending')
  const payloads: unknown[] = []
  const handlers = { ping: (payload: unknown) => void payloads.push(payload) }

  await Promise.all(scheduler.runDueJobs(handlers))
  assert.deepEqual(payloads, [], 'not due yet')
  await Promise.all(scheduler.runDueJobs(handlers, Date.now() + 61_000))
  assert.deepEqual(payloads, [{ n: 1 }])
  assert.equal(job(id).state, 'done')
  await Promise.all(scheduler.runDueJobs(handlers, Date.now() + 61_000))
  assert.equal(payloads.length, 1, 'a done job never runs again')
})

test('a slow job does not block the tick and is never started twice', async () => {
  const id = scheduler.schedule('slow', 0)
  let runs = 0
  let finish = () => {}
  const handlers = { slow: () => { runs++; return new Promise<void>((resolve) => { finish = resolve }) } }

  const first = scheduler.runDueJobs(handlers)
  assert.equal(job(id).state, 'running', 'claimed while the handler works')
  assert.equal(scheduler.runDueJobs(handlers).length, 0, 'the next tick skips it')
  finish()
  await Promise.all(first)
  assert.equal(runs, 1)
  assert.equal(job(id).state, 'done')
})

test('a failing job is retried twice, then marked failed', async (t) => {
  t.mock.method(console, 'warn', () => {})
  t.mock.method(console, 'error', () => {})
  const id = scheduler.schedule('flaky', 0)
  let calls = 0
  const handlers = { flaky: () => { calls++; throw new Error('boom') } }

  await Promise.all(scheduler.runDueJobs(handlers))
  assert.deepEqual([job(id).state, job(id).attempts], ['pending', 1])
  assert.ok(job(id).run_at > Date.now(), 'the retry waits a little')
  await Promise.all(scheduler.runDueJobs(handlers, Date.now() + 60_000))
  assert.deepEqual([job(id).state, job(id).attempts], ['pending', 2])
  await Promise.all(scheduler.runDueJobs(handlers, Date.now() + 120_000))
  assert.deepEqual([job(id).state, job(id).attempts], ['failed', scheduler.MAX_ATTEMPTS])
  assert.equal(calls, 3)
})

test('a job with no handler fails safely', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const id = scheduler.schedule('no_such_kind', 0)
  await Promise.all(scheduler.runDueJobs({}))
  assert.equal(job(id).state, 'failed')
})

test('after a restart, jobs that were running go back to pending', () => {
  const id = scheduler.schedule('interrupted', 0)
  q("UPDATE jobs SET state = 'running' WHERE id = ?").run(id)
  scheduler.recoverJobs()
  assert.equal(job(id).state, 'pending')
  assert.equal(scheduler.hasWaiting('interrupted'), true)
})

test('a job that was running at every crash is failed on restart, not run again', () => {
  const id = scheduler.schedule('crashes_the_server', 0)
  q("UPDATE jobs SET state = 'running', attempts = ? WHERE id = ?").run(scheduler.MAX_ATTEMPTS, id)
  assert.equal(scheduler.hasWaiting('crashes_the_server'), false, 'a running job is not waiting')
  scheduler.recoverJobs()
  assert.equal(job(id).state, 'failed')
})

test('postpone() moves a waiting job later, never earlier (the chat debounce)', () => {
  const id = scheduler.schedule('chat_reply', 5_000, { conversationId: 'c_1' })
  const planned = job(id).run_at
  assert.equal(scheduler.postpone('chat_reply', 'conversationId', 'c_1', planned + 3_000), true)
  assert.equal(job(id).run_at, planned + 3_000)
  scheduler.postpone('chat_reply', 'conversationId', 'c_1', planned - 2_000)
  assert.equal(job(id).run_at, planned + 3_000, 'never earlier')
  assert.equal(scheduler.postpone('chat_reply', 'conversationId', 'c_other', planned), false, 'nothing waiting there')
  assert.equal(scheduler.hasPending('chat_reply', 'conversationId', 'c_1'), true)
})

test('updatePending() sets a field on matching waiting jobs (hype rescales like waves)', () => {
  const mine = scheduler.schedule('post_wave', 10_000, { postId: 'p_1', crowd: 10 })
  const other = scheduler.schedule('post_wave', 10_000, { postId: 'p_2', crowd: 10 })
  scheduler.updatePending('post_wave', ['postId', 'p_1'], ['scale', 1.2])
  assert.equal(JSON.parse(job(mine).payload).scale, 1.2)
  assert.equal(JSON.parse(job(other).payload).scale, undefined)
})

test('rescalePending() moves sim-time jobs and leaves real-time ones alone', () => {
  const sim = scheduler.schedule('post_wave', 100_000, {})
  const chat = scheduler.schedule('chat_reply', 100_000, {})
  const before = Date.now()
  scheduler.rescalePending(0.5, ['chat_reply'])
  const simLeft = job(sim).run_at - before
  assert.ok(simLeft > 45_000 && simLeft <= 50_100, `about half as far away (${simLeft} ms)`)
  assert.ok(job(chat).run_at - before > 99_000, 'chat jobs keep their real-time delay')
})
