/**
 * World database tests: each world is its own file, withWorld() picks which one q() uses (also
 * across awaits and timers), closed worlds open again with their data, tables added with
 * defineTable() exist in every world, Start over empties them, and worldState() keeps memory per
 * world. Runs in local mode, where code outside withWorld() uses the local world. Run with `npm test`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-worlds-'))
process.env.AURA_DATA_DIR = dataDir
delete process.env.GOOGLE_CLIENT_ID
delete process.env.GOOGLE_CLIENT_SECRET
delete process.env.AURA_DEV_LOGIN

const db = await import('./index.ts')

after(() => {
  db.closeAllWorlds()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('each world is its own file, and withWorld picks which one is used', () => {
  db.withWorld('u_first', () => db.setSetting('tier', 'icon'))
  db.withWorld('u_second', () => db.setSetting('tier', 'rising'))
  assert.equal(db.withWorld('u_first', () => db.getSetting('tier', 'none')), 'icon')
  assert.equal(db.withWorld('u_second', () => db.getSetting('tier', 'none')), 'rising')
  assert.equal(db.getSetting('tier', 'none'), 'none', 'local mode: outside withWorld is the local world')
  assert.ok(fs.existsSync(path.join(dataDir, 'worlds', 'u_first', 'aura.db')))
  assert.ok(fs.existsSync(path.join(dataDir, 'aura.db')), 'the local world keeps data/aura.db')
  assert.deepEqual(db.knownWorldIds(), [db.LOCAL_WORLD])
  assert.throws(() => db.withWorld('../escape', () => 1), /Not a world id/)
})

test('the world carries through awaits and timers', async () => {
  const seen = await db.withWorld('u_first', async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    const afterTimer = await new Promise<string>((resolve) => setTimeout(() => resolve(db.currentWorldId()), 5))
    return [db.currentWorldId(), afterTimer, db.getSetting('tier', 'none')]
  })
  assert.deepEqual(seen, ['u_first', 'u_first', 'icon'])
})

test('a closed world opens again by itself, with its data', () => {
  db.closeWorld('u_second')
  assert.equal(db.withWorld('u_second', () => db.getSetting('tier', 'none')), 'rising')
})

test('transactions belong to one world: inner ones join, a throw rolls back', () => {
  db.withWorld('u_first', () => {
    assert.throws(() => db.tx(() => {
      db.setSetting('speed', 'instant')
      db.tx(() => db.setSetting('model', 'haiku'))
      throw new Error('undo all of it')
    }), /undo all of it/)
    assert.equal(db.getSetting('speed', 'unset'), 'unset')
    assert.equal(db.getSetting('model', 'unset'), 'unset')
  })
})

test('defineTable adds a table to open and new worlds, and Start over empties it', () => {
  db.defineTable('test_events', 'CREATE TABLE IF NOT EXISTS test_events (id INTEGER PRIMARY KEY, what TEXT NOT NULL)')
  db.withWorld('u_first', () => db.q('INSERT INTO test_events (what) VALUES (?)').run('open world'))
  db.withWorld('u_third', () => db.q('INSERT INTO test_events (what) VALUES (?)').run('new world'))
  db.withWorld('u_first', () => {
    db.wipeAll()
    assert.equal(db.q('SELECT COUNT(*) AS n FROM test_events').get()?.n, 0)
    assert.equal(db.getSetting('tier', 'none'), 'none', 'Start over wipes the settings too')
  })
  assert.equal(db.withWorld('u_third', () => db.q('SELECT COUNT(*) AS n FROM test_events').get()?.n), 1, 'other worlds keep theirs')
  assert.equal(db.withWorld('u_second', () => db.getSetting('tier', 'none')), 'rising')
})

test('worldState keeps a separate copy of memory per world', () => {
  const counter = db.worldState(() => ({ count: 0 }))
  db.withWorld('u_first', () => counter().count++)
  db.withWorld('u_first', () => counter().count++)
  db.withWorld('u_second', () => counter().count++)
  assert.equal(db.withWorld('u_first', () => counter().count), 2)
  assert.equal(db.withWorld('u_second', () => counter().count), 1)
  assert.equal(counter().count, 0, 'the local world has its own too')
})
