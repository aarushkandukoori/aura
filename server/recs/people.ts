/**
 * "Suggested for you" accounts: characters the user doesn't follow yet, best match first.
 */
import type { Account } from '../../shared/types.ts'
import { q } from '../db/index.ts'
import { toAccounts } from '../repo/accounts.ts'
import { stableFraction } from '../repo/random.ts'
import type { AccountRow } from '../repo/rows.ts'
import { accountTopics, loadCandidates } from './catalog.ts'
import { DAY_MS } from './decay.ts'
import { currentTaste } from './rank.ts'
import { authorPreference, topicMatch } from './score.ts'

/** Bigger accounts get a small head start. Creators and mutuals are the usual follows. */
const ROLE_BONUS: Record<string, number> = { creator: 0.3, mutual: 0.2, fan: 0.1 }

/**
 * Up to `limit` accounts to follow: characters the user doesn't follow, scored by how much they
 * engaged with them already (profile visits, likes in Explore), how well the topics they post
 * about match the user's, and a little by size. Topped up with people who follow the user.
 */
export function recommendAccounts(limit = 8, now = Date.now()): Account[] {
  const taste = currentTaste(now)
  const topicsByAuthor = accountTopics(loadCandidates({ now }))
  const day = Math.floor(now / DAY_MS) // the order shifts a little each day, not on every refresh
  const rows = q("SELECT * FROM accounts WHERE kind = 'cast' AND i_follow = 0").all() as AccountRow[]
  const ranked = rows
    .map((row) => ({
      row,
      score: 2.0 * authorPreference(taste, { id: row.id, closeness: row.closeness, followed: false })
        + 1.5 * topicMatch(taste, topicsByAuthor.get(row.id) ?? [])
        + 0.4 * Math.min(1, Math.log10(1 + row.followers) / 7)
        + (ROLE_BONUS[row.role ?? ''] ?? 0)
        + 0.2 * stableFraction(`${day}:${row.id}`),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.row)
  const crowd = ranked.length < limit
    ? q(`SELECT * FROM accounts WHERE kind = 'crowd' AND follows_me = 1 AND i_follow = 0 AND avatar IS NOT NULL
         ORDER BY followers DESC LIMIT ?`).all(limit - ranked.length) as AccountRow[]
    : []
  return toAccounts([...ranked, ...crowd])
}
