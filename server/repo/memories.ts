/**
 * Things characters remember about the user ("has a dog named Mochi", "starting a new job").
 * account_id '*' means the whole cast knows it.
 */
import { now, q } from '../db/index.ts'

/** Remember a fact about the user (exact repeats are skipped). */
export function addMemory(accountId: string, fact: string): void {
  const text = fact.trim().slice(0, 300)
  if (!text) return
  const known = q('SELECT 1 FROM memories WHERE account_id = ? AND fact = ?').get(accountId, text)
  if (!known) q('INSERT INTO memories (account_id, fact, created_at) VALUES (?, ?, ?)').run(accountId, text, now())
}

/** The newest facts a character knows (their own plus the whole cast's), newest first. */
export function getMemories(accountId: string, limit = 12): string[] {
  const rows = q("SELECT fact FROM memories WHERE account_id IN (?, '*') ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(accountId, limit) as { fact: string }[]
  return rows.map((row) => row.fact)
}
