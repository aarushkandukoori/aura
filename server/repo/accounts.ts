/**
 * Accounts: reading account rows and turning them into the Account shape every screen uses,
 * plus search, suggestions and small account updates ("Active now", closeness).
 */
import type { Account, Role } from '../../shared/types.ts'
import { bit, now, parseJson, q } from '../db/index.ts'
import { broadcast } from '../live.ts'
import { jsonList, type AccountRow } from './rows.ts'
import { likeEscape } from './text.ts'

/** "Active now" shows when someone did something in the last 5 minutes. */
export const ACTIVE_WINDOW_MS = 5 * 60 * 1000

export function getAccountRow(id: string): AccountRow | undefined {
  return q('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined
}

/** Every username is stored lowercase; people type them however they like. */
export function getAccountByUsername(username: string): AccountRow | undefined {
  const clean = username.trim().replace(/^@/, '').toLowerCase()
  return q('SELECT * FROM accounts WHERE username = ?').get(clean) as AccountRow | undefined
}

/** The human's row, or undefined before onboarding. */
export function getMeRow(): AccountRow | undefined {
  return getAccountRow('me')
}

/**
 * Story ring state for many accounts in one query: how many unexpired stories each has and how
 * many of those I have already seen.
 */
function storyStates(ids: string[]): Map<string, { active: number; seen: number }> {
  const rows = q(`
    SELECT author_id, COUNT(*) AS active, SUM(seen) AS seen FROM stories
    WHERE released = 1 AND expires_at > ? AND author_id IN (SELECT value FROM json_each(?))
    GROUP BY author_id`).all(now(), jsonList(ids)) as { author_id: string; active: number; seen: number }[]
  return new Map(rows.map((row) => [row.author_id, { active: row.active, seen: row.seen }]))
}

/** Turn account rows into Account objects (one extra query for the whole list, never one per row). */
export function toAccounts(rows: AccountRow[]): Account[] {
  if (rows.length === 0) return []
  const stories = storyStates([...new Set(rows.map((row) => row.id))])
  return rows.map((row) => {
    const story = stories.get(row.id)
    return {
      id: row.id,
      kind: row.kind,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      verified: row.verified === 1,
      role: row.role,
      followsMe: row.follows_me === 1,
      iFollow: row.i_follow === 1,
      hasStory: story !== undefined,
      storySeen: story !== undefined && story.seen >= story.active,
      lastActiveAt: row.last_active_at,
    }
  })
}

export function toAccount(row: AccountRow): Account {
  return toAccounts([row])[0]
}

/** Accounts by id as a Map, in two queries. Unknown ids are simply missing from the map. */
export function accountsByIds(ids: Iterable<string>): Map<string, Account> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = q('SELECT * FROM accounts WHERE id IN (SELECT value FROM json_each(?))').all(jsonList(unique)) as AccountRow[]
  return new Map(toAccounts(rows).map((account) => [account.id, account]))
}

export function getAccount(id: string): Account | null {
  const row = getAccountRow(id)
  return row ? toAccount(row) : null
}

/** Tell every open app that someone's follow state, story ring or "Active now" changed. */
export function broadcastAccount(id: string): void {
  const account = getAccount(id)
  if (account) broadcast({ type: 'account.updated', account })
}

// ----- the cast, with their personalities (for the simulation's prompts) ---------------------

/** What accounts.persona holds for each cast member (copied from content/cast.json). */
export interface Persona {
  look: string
  voice: string
  traits: string[]
  interests: string[]
  relationship: string
  concept: string
  age: number
}

/** A cast member with everything the simulation needs to write as them. */
export interface CastMember {
  id: string
  username: string
  displayName: string
  avatar: string | null
  role: Role
  closeness: number
  followsMe: boolean
  iFollow: boolean
  verified: boolean
  followers: number
  following: number
  bio: string
  pronouns: string
  location: string | null
  occupation: string | null
  lastActiveAt: number | null
  persona: Persona
}

const EMPTY_PERSONA: Persona = { look: '', voice: '', traits: [], interests: [], relationship: '', concept: '', age: 25 }

function toCastMember(row: AccountRow): CastMember {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    role: row.role ?? 'mutual',
    closeness: row.closeness,
    followsMe: row.follows_me === 1,
    iFollow: row.i_follow === 1,
    verified: row.verified === 1,
    followers: row.followers,
    following: row.following,
    bio: row.bio,
    pronouns: row.pronouns,
    location: row.location,
    occupation: row.occupation,
    lastActiveAt: row.last_active_at,
    persona: { ...EMPTY_PERSONA, ...parseJson<Partial<Persona>>(row.persona, {}) },
  }
}

/** Every cast member, closest to the user first. */
export function getCast(): CastMember[] {
  const rows = q("SELECT * FROM accounts WHERE kind = 'cast' ORDER BY closeness DESC, id").all() as AccountRow[]
  return rows.map(toCastMember)
}

export function getCastMember(id: string): CastMember | null {
  const row = getAccountRow(id)
  return row && row.kind === 'cast' ? toCastMember(row) : null
}

// ----- small updates the simulation makes ----------------------------------------------------

/** Mark someone as active right now. Apps hear about it only when the green dot appears. */
export function touchActive(accountId: string): void {
  const row = getAccountRow(accountId)
  if (!row || row.kind === 'me') return
  const time = now()
  q('UPDATE accounts SET last_active_at = ? WHERE id = ?').run(time, accountId)
  const wasActive = row.last_active_at !== null && time - row.last_active_at < ACTIVE_WINDOW_MS
  if (!wasActive) broadcast({ type: 'account.updated', account: toAccount({ ...row, last_active_at: time }) })
}

/** Move a cast member's closeness to the user up (or down), kept between 0 and 1. */
export function bumpCloseness(accountId: string, amount: number): void {
  q("UPDATE accounts SET closeness = MIN(1, MAX(0, closeness + ?)) WHERE id = ? AND kind = 'cast'").run(amount, accountId)
}

/** Random crowd account ids. followingMe: true = only my followers, false = only non-followers. */
export function randomCrowdIds(count: number, options: { followingMe?: boolean } = {}): string[] {
  if (count <= 0) return []
  const rows = options.followingMe === undefined
    ? q("SELECT id FROM accounts WHERE kind = 'crowd' ORDER BY random() LIMIT ?").all(count)
    : q("SELECT id FROM accounts WHERE kind = 'crowd' AND follows_me = ? ORDER BY random() LIMIT ?").all(bit(options.followingMe), count)
  return rows.map((row) => String(row.id))
}

// ----- search and suggestions ----------------------------------------------------------------

/** Accounts whose username or name contains the query: me, then cast, then crowd; prefix matches first. */
export function searchAccounts(query: string, limit = 30): Account[] {
  const text = query.trim().replace(/^@/, '')
  if (!text) return []
  const contains = `%${likeEscape(text)}%`
  const prefix = `${likeEscape(text)}%`
  const rows = q(`
    SELECT * FROM accounts
    WHERE username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\'
    ORDER BY CASE kind WHEN 'me' THEN 0 WHEN 'cast' THEN 1 ELSE 2 END,
      (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') DESC,
      i_follow DESC, followers DESC
    LIMIT ?`).all(contains, contains, prefix, prefix, limit) as AccountRow[]
  return toAccounts(rows)
}

/**
 * "Suggested for you": cast I don't follow (creators and mutuals first), topped up with people
 * who already follow me, so the list is never empty.
 */
export function getSuggestions(limit = 8): Account[] {
  const cast = q(`
    SELECT * FROM accounts WHERE kind = 'cast' AND i_follow = 0
    ORDER BY CASE role WHEN 'creator' THEN 0 WHEN 'mutual' THEN 1 WHEN 'fan' THEN 2 ELSE 3 END, followers DESC
    LIMIT ?`).all(limit) as AccountRow[]
  const crowd = cast.length < limit
    ? q(`SELECT * FROM accounts WHERE kind = 'crowd' AND follows_me = 1 AND i_follow = 0 AND avatar IS NOT NULL
         ORDER BY followers DESC LIMIT ?`).all(limit - cast.length) as AccountRow[]
    : []
  return toAccounts([...cast, ...crowd])
}
