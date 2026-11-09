/**
 * Checks a WorldPlan field by field, whether the AI just wrote it or an app sent it back with
 * POST /api/onboarding (an app could send anything). Unknown characters are dropped, roles and
 * tiers must be real ones, texts are trimmed and cut to size, and missing parts get defaults. So
 * whatever comes in, the world that gets built is sensible.
 */
import type { CastPersona } from '../../shared/cast.ts'
import type { Role, Tier, WorldPlan } from '../../shared/types.ts'
import { TIERS } from '../config.ts'
import { firstNameOf, pickableCast, previewAccount } from './roster.ts'
import { freeUsername } from './username.ts'

export const PLAN_LIMITS = { besties: 4, friends: 8, groups: 4, groupMembers: 6, newFriends: 3, memories: 12, interests: 10 }

/** A world needs a couple of besties: they send the welcome DMs and fill the besties' group chat. */
const MIN_BESTIES = 2

type Raw = Record<string, unknown>
type Friend = WorldPlan['friends'][number]
type Group = WorldPlan['groupChats'][number]

const record = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {})
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** Text with tidy spaces, cut to `max` characters (at a word break when there is one near the end). */
export function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:-]+$/, '')
}

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' })

/** The first emoji in the text (flags and combined emoji included), or the fallback. */
export function oneEmoji(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  for (const { segment } of graphemes.segment(value.trim())) {
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segment)) return segment
  }
  return fallback
}

export interface CleanContext {
  cast: CastPersona[]
  /** The signed-in Google account's name, used when the plan has no name. */
  fallbackName?: string | null
}

export function cleanPlan(input: unknown, context: CleanContext): WorldPlan {
  const raw = record(input)
  const displayName = clip(raw.displayName, 40) || clip(context.fallbackName, 40)
  const friends = cleanFriends(raw.friends, context.cast)
  const groupChats = cleanGroups(raw.groupChats, friends)
  return {
    displayName,
    username: freeUsername([clip(raw.username, 40), displayName, `${firstNameOf(displayName)}.irl`]),
    bio: clip(raw.bio, 150),
    pronouns: clip(raw.pronouns, 30),
    interests: cleanInterests(raw.interests),
    origin: clip(raw.origin, 80) || 'college',
    tier: typeof raw.tier === 'string' && raw.tier in TIERS ? (raw.tier as Tier) : 'popular',
    summary: clip(raw.summary, 400) || defaultSummary(friends, groupChats),
    friends,
    groupChats,
    newFriends: cleanNewFriends(raw.newFriends),
    memories: cleanMemories(raw.memories),
  }
}

/**
 * The user's people: known characters only, each once, at most 4 besties (extra ones become
 * friends) and 8 friends. Besties come first, otherwise the plan's order is kept: the order says
 * who matters most (the closest ones send the first welcome DMs).
 */
function cleanFriends(raw: unknown, cast: CastPersona[]): Friend[] {
  const pickable = pickableCast(cast)
  const byId = new Map(pickable.map((persona) => [persona.id, persona]))
  const chosen: { persona: CastPersona; role: Role; relationship: string }[] = []
  const count = (role: Role) => chosen.filter((friend) => friend.role === role).length

  for (const item of list(raw).map(record)) {
    const persona = byId.get(String(item.id))
    if (!persona || chosen.some((friend) => friend.persona.id === persona.id)) continue
    const role: Role = item.role === 'bestie' && count('bestie') < PLAN_LIMITS.besties ? 'bestie' : 'friend'
    if (role === 'friend' && count('friend') >= PLAN_LIMITS.friends) continue
    chosen.push({ persona, role, relationship: clip(item.relationship, 300) || persona.relationship })
  }

  // Too few besties: promote the first friends, then bring in the cast's own besties.
  for (const friend of chosen) {
    if (count('bestie') < MIN_BESTIES && friend.role === 'friend') friend.role = 'bestie'
  }
  for (const persona of pickable.filter((candidate) => candidate.role === 'bestie')) {
    if (count('bestie') >= MIN_BESTIES) break
    if (chosen.some((friend) => friend.persona.id === persona.id)) continue
    chosen.push({ persona, role: 'bestie', relationship: persona.relationship })
  }

  const ordered = [...chosen.filter((friend) => friend.role === 'bestie'), ...chosen.filter((friend) => friend.role !== 'bestie')]
  return ordered.map(({ persona, role, relationship }) => ({
    id: persona.id, role, relationship, account: previewAccount(persona, role),
  }))
}

/** 2-4 group chats of chosen people (2-6 each), different titles. Missing ones are filled with defaults. */
function cleanGroups(raw: unknown, friends: Friend[]): Group[] {
  const chosen = new Set(friends.map((friend) => friend.id))
  const groups: Group[] = []
  for (const item of list(raw).map(record)) {
    const title = clip(item.title, 40)
    const memberIds = [...new Set(list(item.memberIds).map(String))].filter((id) => chosen.has(id)).slice(0, PLAN_LIMITS.groupMembers)
    if (!title || memberIds.length < 2 || groups.some((group) => group.title.toLowerCase() === title.toLowerCase())) continue
    groups.push({ title, emoji: oneEmoji(item.emoji, '💬'), vibe: clip(item.vibe, 160) || 'friends catching up', memberIds })
    if (groups.length === PLAN_LIMITS.groups) break
  }
  const sameMembers = (a: Group, b: Group) => a.memberIds.length === b.memberIds.length && a.memberIds.every((id) => b.memberIds.includes(id))
  for (const extra of defaultGroups(friends)) {
    if (groups.length < 2 && !groups.some((group) => sameMembers(group, extra) || group.title === extra.title)) groups.push(extra)
  }
  return groups
}

/** The besties' chat and a chat with a few friends, for plans without (enough) usable chats. */
function defaultGroups(friends: Friend[]): Group[] {
  const besties = friends.filter((friend) => friend.role === 'bestie').map((friend) => friend.id)
  const others = friends.filter((friend) => friend.role === 'friend').map((friend) => friend.id).slice(0, 4)
  const groups: Group[] = []
  if (besties.length >= 2) groups.push({ title: 'the besties', emoji: '💌', vibe: 'inner circle, chaotic, supportive', memberIds: besties })
  if (others.length >= 2) groups.push({ title: 'weekend plans', emoji: '🍻', vibe: 'plans, memes and catching up', memberIds: others })
  return groups
}

/** People they described whom no character fits: a name, who they are, and a role (never fan or creator). */
function cleanNewFriends(raw: unknown): WorldPlan['newFriends'] {
  const people: WorldPlan['newFriends'] = []
  for (const item of list(raw).map(record)) {
    const name = clip(item.name, 40).replace(/[^\p{L}\p{M}' .-]/gu, '').trim()
    const description = clip(item.description, 300)
    if (!name || !description || people.some((person) => person.name.toLowerCase() === name.toLowerCase())) continue
    const role: Role = item.role === 'bestie' || item.role === 'mutual' ? item.role : 'friend'
    people.push({ name, description, role })
    if (people.length === PLAN_LIMITS.newFriends) break
  }
  return people
}

function cleanInterests(raw: unknown): string[] {
  const words = list(raw).map((word) => clip(word, 30).toLowerCase().replace(/^#/, '')).filter(Boolean)
  return [...new Set(words)].slice(0, PLAN_LIMITS.interests)
}

function cleanMemories(raw: unknown): string[] {
  const memories: string[] = []
  for (const item of list(raw)) {
    const fact = clip(item, 160).replace(/\.$/, '')
    if (fact.length >= 3 && !memories.some((known) => known.toLowerCase() === fact.toLowerCase())) memories.push(fact)
  }
  return memories.slice(0, PLAN_LIMITS.memories)
}

/** "Maya, Tyler and Jules are your inner circle, and “leg day survivors” is already buzzing." */
function defaultSummary(friends: Friend[], groups: Group[]): string {
  const names = friends.filter((friend) => friend.role === 'bestie').map((friend) => firstNameOf(friend.account?.displayName ?? friend.id))
  const people = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? 'Your people'
  const chat = groups[0] ? `, and “${groups[0].title}” is already buzzing` : ''
  return `${people} ${names.length > 1 ? 'are' : 'is'} your inner circle${chat}. Everyone's happy to see you.`
}
