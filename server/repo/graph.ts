/**
 * Who follows whom, for accounts other than the user.
 *
 * The database only stores how everyone relates to the user (follows_me / i_follow). Follower
 * lists of other people are made up from a stable hash instead, so a profile always shows the
 * same followers and nobody stores millions of rows. Roles shape the odds: the user's friends all
 * know each other, creators follow almost nobody, and the crowd mostly follows creators.
 */
import type { Account, FollowListResponse } from '../../shared/types.ts'
import { q } from '../db/index.ts'
import { toAccounts } from './accounts.ts'
import { offsetCursor, readOffset } from './paging.ts'
import { stableFraction } from './random.ts'
import type { AccountRow } from './rows.ts'

const PAGE_SIZE = 30

const inCircle = (row: AccountRow) => row.role === 'bestie' || row.role === 'friend'

/** The chance that account `a` follows account `b` (neither of them is me). */
function followChance(a: AccountRow, b: AccountRow): number {
  if (a.kind === 'crowd') return b.role === 'creator' ? 0.8 : b.kind === 'cast' ? 0.25 : 0.05
  if (a.role === 'creator') return b.role === 'creator' ? 0.4 : b.kind === 'cast' ? 0.03 : 0.15
  if (b.role === 'creator') return 0.5
  if (b.kind === 'crowd') return 0.2
  return inCircle(a) && inCircle(b) ? 0.9 : 0.45
}

/** Does `a` follow `b`? Real data when the user is involved, a stable roll otherwise. */
export function follows(a: AccountRow, b: AccountRow): boolean {
  if (a.id === b.id) return false
  if (a.kind === 'me') return b.i_follow === 1
  if (b.kind === 'me') return a.follows_me === 1
  return stableFraction(`${a.id}>${b.id}`) < followChance(a, b)
}

const KIND_ORDER = { me: 0, cast: 1, crowd: 2 }

/** Me first, then cast (closest first), then the crowd in a shuffled order that never changes. */
function listOrder(ownerId: string, rows: AccountRow[]): AccountRow[] {
  return rows
    .map((row) => ({ row, shuffle: stableFraction(`${ownerId}~${row.id}`) }))
    .sort((a, b) => KIND_ORDER[a.row.kind] - KIND_ORDER[b.row.kind] || b.row.closeness - a.row.closeness || a.shuffle - b.shuffle)
    .map((item) => item.row)
}

/**
 * Followers or following of any account, 30 per page, optionally filtered by username or name.
 * `total` is the number on the profile (lists can be shorter: the crowd is mostly just a number).
 */
export function followList(
  owner: AccountRow,
  direction: 'followers' | 'following',
  cursor: string | null,
  query: string,
): FollowListResponse {
  const everyone = q('SELECT * FROM accounts WHERE id != ?').all(owner.id) as AccountRow[]
  const related = everyone.filter((other) => (direction === 'followers' ? follows(other, owner) : follows(owner, other)))
  const total = direction === 'followers' ? owner.followers : owner.following

  // A small account can't list more people than its count says: trim the crowd, never the cast.
  const ordered = listOrder(owner.id, related)
  const named = ordered.filter((row) => row.kind !== 'crowd').length
  let list = ordered.slice(0, Math.max(named, total))

  const text = query.trim().replace(/^@/, '').toLowerCase()
  if (text) {
    list = list.filter((row) => row.username.includes(text) || row.display_name.toLowerCase().includes(text))
  }
  const offset = readOffset(cursor)
  const page = list.slice(offset, offset + PAGE_SIZE)
  return { accounts: toAccounts(page), total, nextCursor: offsetCursor(offset + PAGE_SIZE, list.length) }
}

/** "Followed by maya, dev.k and 12 others": accounts I follow that follow this account. */
export function mutualsOf(owner: AccountRow): { accounts: Account[]; count: number } {
  if (owner.kind === 'me') return { accounts: [], count: 0 }
  const followed = q('SELECT * FROM accounts WHERE i_follow = 1 AND id != ? ORDER BY closeness DESC, id')
    .all(owner.id) as AccountRow[]
  const mutuals = followed.filter((other) => follows(other, owner))
  return { accounts: toAccounts(mutuals.slice(0, 3)), count: mutuals.length }
}
