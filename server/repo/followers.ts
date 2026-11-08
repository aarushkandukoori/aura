/**
 * The user's social numbers: who they follow, who follows them, milestones and aura.
 */
import type { Account, Tier } from '../../shared/types.ts'
import { bit, getSetting, now, q, setSetting, tx } from '../db/index.ts'
import { broadcast } from '../live.ts'
import { getAccount, getAccountRow, getMeRow, randomCrowdIds, toAccounts } from './accounts.ts'
import { celebrate, pushNotification } from './notifications.ts'
import { jsonList, type AccountRow } from './rows.ts'

const MILESTONES = [
  1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000,
  1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000,
]

/** How many released posts an account has. */
export function countPosts(accountId: string): number {
  const row = q('SELECT COUNT(*) AS n FROM posts WHERE author_id = ? AND released = 1').get(accountId) as { n: number }
  return row.n
}

/** My follower / following / post counts, aura or tier changed: tell every open app. */
export function broadcastMeStats(): void {
  const me = getMeRow()
  if (!me) return
  broadcast({
    type: 'me.stats',
    followers: me.followers,
    following: me.following,
    postCount: countPosts('me'),
    aura: getSetting('aura', 0),
    verified: me.verified === 1,
    tier: getSetting<Tier>('tier', 'popular'),
  })
}

/** The user follows or unfollows someone. Returns their updated Account (null if unknown or me). */
export function setFollow(accountId: string, follow: boolean): Account | null {
  const row = getAccountRow(accountId)
  if (!row || row.kind === 'me') return null
  if ((row.i_follow === 1) !== follow) {
    tx(() => {
      q('UPDATE accounts SET i_follow = ?, followers = MAX(0, followers + ?) WHERE id = ?').run(bit(follow), follow ? 1 : -1, accountId)
      q("UPDATE accounts SET following = (SELECT COUNT(*) FROM accounts WHERE i_follow = 1) WHERE id = 'me'").run()
    })
  }
  const account = getAccount(accountId)
  if (account) broadcast({ type: 'account.updated', account })
  broadcastMeStats()
  return account
}

/** Follows merge into one notification per calendar day: 'follow:2026-11-8'. */
export function followGroupKey(time: number): string {
  const date = new Date(time)
  return `follow:${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/**
 * New followers: the named accounts (cast or crowd ids) start following me, plus `crowdCount`
 * anonymous ones. Named accounts that already follow me are skipped. Raises my follower count,
 * merges into today's "follow" notification (newest named follower in front), broadcasts, and
 * celebrates follower milestones.
 */
export function addFollowers(namedIds: string[], crowdCount: number): void {
  const me = getMeRow()
  if (!me) return
  const found = q("SELECT * FROM accounts WHERE kind != 'me' AND follows_me = 0 AND id IN (SELECT value FROM json_each(?))")
    .all(jsonList(namedIds)) as AccountRow[]
  const byId = new Map(found.map((row) => [row.id, row]))
  // Keep the caller's order, so the last id is the newest follower.
  const fresh = [...new Set(namedIds)].flatMap((id) => byId.get(id) ?? [])
  let anonymous = Math.max(0, Math.round(crowdCount))

  // A crowd-only batch still gets a face: one crowd account becomes a real, listed follower.
  if (fresh.length === 0 && anonymous > 0) {
    const faceId = randomCrowdIds(1, { followingMe: false })[0]
    const face = faceId ? getAccountRow(faceId) : undefined
    if (face) {
      fresh.push(face)
      anonymous -= 1
    }
  }
  const added = fresh.length + anonymous
  if (added === 0) return

  tx(() => {
    for (const row of fresh) q('UPDATE accounts SET follows_me = 1 WHERE id = ?').run(row.id)
    q("UPDATE accounts SET followers = followers + ? WHERE id = 'me'").run(added)
  })
  const actor = fresh.at(-1)
  pushNotification({ kind: 'follow', actorId: actor?.id ?? null, others: added - (actor ? 1 : 0), groupKey: followGroupKey(now()) })
  for (const account of toAccounts(fresh.map((row) => ({ ...row, follows_me: 1 })))) {
    broadcast({ type: 'account.updated', account })
  }
  broadcastMeStats()
  checkMilestones(me.followers, me.followers + added)
}

/** One named account follows me back (shortcut for addFollowers([id], 0)). */
export function followBack(accountId: string): void {
  addFollowers([accountId], 0)
}

function milestoneLabel(count: number): string {
  return count >= 1_000_000 ? `${count / 1_000_000}M` : `${count / 1_000}K`
}

/** Crossing 1K, 5K, 10K... followers: a milestone notification and a celebration (the biggest one only). */
function checkMilestones(before: number, after: number): void {
  const reached = MILESTONES.filter((milestone) => before < milestone && after >= milestone).at(-1)
  if (!reached) return
  const label = milestoneLabel(reached)
  pushNotification({ kind: 'milestone', text: `You hit ${label} followers 🎉` })
  celebrate(`${label} followers!`, `You just hit ${label} followers. Everyone's happy to see you ✨`)
}

/** Raise (or lower) the user's aura score and broadcast the new number. */
export function bumpAura(amount: number): void {
  if (!getMeRow()) return
  setSetting('aura', Math.max(0, getSetting('aura', 0) + Math.round(amount)))
  broadcastMeStats()
}
