/**
 * Profile pages (anyone's), the user's own Me object, and editing my profile.
 */
import type { Highlight, Me, Profile, Tier, UpdateMeRequest } from '../../shared/types.ts'
import { getSetting, parseJson, q, setSetting } from '../db/index.ts'
import { broadcastAccount, getAccountByUsername, getMeRow, toAccount } from './accounts.ts'
import { countPosts } from './followers.ts'
import { mutualsOf } from './graph.ts'
import type { AccountRow } from './rows.ts'

function getHighlights(accountId: string): Highlight[] {
  const rows = q('SELECT id, title, cover, story_ids FROM highlights WHERE account_id = ? ORDER BY created_at')
    .all(accountId) as { id: string; title: string; cover: string; story_ids: string }[]
  return rows.map((row) => ({ id: row.id, title: row.title, cover: row.cover, storyIds: parseJson<string[]>(row.story_ids, []) }))
}

function toProfile(row: AccountRow): Profile {
  const mutuals = mutualsOf(row)
  return {
    ...toAccount(row),
    bio: row.bio,
    pronouns: row.pronouns,
    location: row.location,
    occupation: row.occupation,
    followers: row.followers,
    following: row.following,
    postCount: countPosts(row.id),
    mutuals: mutuals.accounts,
    mutualCount: mutuals.count,
    isMe: row.kind === 'me',
    highlights: getHighlights(row.id),
  }
}

/** The user's full profile plus tier, interests and aura. Null before onboarding. */
export function getMe(): Me | null {
  const row = getMeRow()
  if (!row) return null
  return {
    ...toProfile(row),
    tier: getSetting<Tier>('tier', 'popular'),
    interests: getSetting<string[]>('interests', []),
    aura: getSetting('aura', 0),
  }
}

/** Anyone's profile page by username. Mine comes back as the full Me (isMe: true). */
export function getProfile(username: string): Profile | null {
  const row = getAccountByUsername(username)
  if (!row) return null
  return row.kind === 'me' ? getMe() : toProfile(row)
}

/**
 * Edit my profile (only the fields given). The caller checks that a new username is valid and
 * free. Broadcasts my updated Account so names and avatars refresh everywhere.
 */
export function updateMe(changes: UpdateMeRequest): Me | null {
  const row = getMeRow()
  if (!row) return null
  q("UPDATE accounts SET display_name = ?, username = ?, avatar = ?, bio = ?, pronouns = ? WHERE id = 'me'").run(
    changes.displayName ?? row.display_name,
    changes.username ?? row.username,
    changes.avatar !== undefined ? changes.avatar : row.avatar,
    changes.bio ?? row.bio,
    changes.pronouns ?? row.pronouns,
  )
  if (changes.interests) setSetting('interests', changes.interests)
  broadcastAccount('me')
  return getMe()
}
