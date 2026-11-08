/**
 * Builds the world when the user finishes onboarding (SPEC section 7): the user's account, the
 * cast and the crowd, every character's posts, stories and highlights, the group chats and the
 * first "started following you" notification.
 *
 * It all runs in one transaction, so a failure never leaves a half-built world behind, and it is
 * quick (one prepared statement per kind of row, ~3,000 inserts).
 */
import type { CastPersona, CrowdAccount } from '../../shared/cast.ts'
import type { OnboardingRequest, Role, Tier } from '../../shared/types.ts'
import { TIERS } from '../config.ts'
import { bit, newId, q, setSetting, tx } from '../db/index.ts'
import { createGroup, followGroupKey, interestEmoji, interestScore, isVerifiedTier } from '../repo/index.ts'
import { chance, pick, randomBetween, randomInt, sample, shuffle } from '../repo/random.ts'
import { loadContent } from './content.ts'
import { seedPosts } from './posts.ts'
import { seedStories } from './stories.ts'

const MINUTE = 60_000

const CLOSENESS: Record<Role, number> = { bestie: 0.9, friend: 0.7, mutual: 0.4, fan: 0.3, creator: 0.1 }

/** How many crowd accounts already follow the user when they arrive. */
const CROWD_FOLLOWING_ME = 400

const FRIEND_GROUP_NAMES: [title: string, emoji: string][] = [
  ['weekend plans', '🍻'], ['brunch club', '🥞'], ['friday night crew', '🎉'], ['the usual suspects', '🕺'],
]

export function buildWorld(request: OnboardingRequest): void {
  const { cast, crowd } = loadContent({ fresh: true })
  const time = Date.now()
  tx(() => {
    insertMe(request, time)
    const followedCreators = creatorsToFollow(cast, request.interests)
    for (const persona of cast) insertCastMember(persona, followedCreators.has(persona.id), time)
    insertCrowd(crowd.accounts, time)
    q("UPDATE accounts SET following = (SELECT COUNT(*) FROM accounts WHERE i_follow = 1) WHERE id = 'me'").run()
    seedPosts(cast, crowd.accounts.map((account) => account.id), time, request.displayName.split(' ')[0])
    seedStories(cast, time)
    seedGroups(cast, request.interests)
    seedFirstFollowers(cast, request.tier, time)
    saveSettings(request)
  })
}

function insertMe(request: OnboardingRequest, time: number): void {
  q(`INSERT INTO accounts (id, kind, username, display_name, avatar, bio, pronouns, verified, followers, last_active_at, created_at)
     VALUES ('me', 'me', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    request.username, request.displayName, request.avatar, request.bio, request.pronouns,
    bit(isVerifiedTier(request.tier)), TIERS[request.tier].followers, time, time,
  )
}

/**
 * Creators I follow: the ones whose interests overlap mine, best matches first, at least 3 and at
 * most 5 (so a few are left for "Suggested for you").
 */
function creatorsToFollow(cast: CastPersona[], interests: string[]): Set<string> {
  // Shuffle first so ties between equally matching creators are broken randomly.
  const ranked = shuffle(cast.filter((persona) => persona.role === 'creator'))
    .map((persona) => ({ id: persona.id, score: interestScore(interests, (persona.interests ?? []).join(', ')) }))
    .sort((a, b) => b.score - a.score)
  const matching = ranked.filter((creator) => creator.score > 0).length
  return new Set(ranked.slice(0, Math.min(5, Math.max(3, matching))).map((creator) => creator.id))
}

/** Some friends are online right now ("Active now"); everyone else was on in the last few hours. */
function lastActiveAt(role: Role, time: number): number {
  const onlineChance = role === 'bestie' ? 0.6 : role === 'friend' ? 0.35 : 0.15
  return chance(onlineChance) ? time - randomInt(0, 4) * MINUTE : time - randomInt(20, 600) * MINUTE
}

function insertCastMember(persona: CastPersona, followedCreator: boolean, time: number): void {
  const isCreator = persona.role === 'creator'
  const personality = {
    look: persona.look, voice: persona.voice, traits: persona.traits, interests: persona.interests,
    relationship: persona.relationship, concept: persona.concept, age: persona.age,
  }
  q(`INSERT INTO accounts (id, kind, username, display_name, avatar, bio, pronouns, location, occupation, verified, role,
       persona, followers, following, follows_me, i_follow, closeness, last_active_at, created_at)
     VALUES (?, 'cast', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    persona.id, persona.username.toLowerCase(), persona.displayName, persona.avatar?.file ?? null, persona.bio ?? '',
    persona.pronouns ?? '', persona.location ?? null, persona.occupation ?? null, bit(persona.verified), persona.role,
    JSON.stringify(personality), persona.followers ?? 0, persona.following ?? 0,
    bit(!isCreator), bit(!isCreator || followedCreator), CLOSENESS[persona.role] ?? 0.3, lastActiveAt(persona.role, time), time,
  )
}

/** The crowd: background followers. The first 400 already follow me. */
function insertCrowd(accounts: CrowdAccount[], time: number): void {
  accounts.forEach((account, index) => {
    // Most people have a few hundred followers; a few have a couple of thousand.
    const followers = Math.round(40 + Math.random() ** 2 * 2400)
    q(`INSERT INTO accounts (id, kind, username, display_name, avatar, followers, following, follows_me, last_active_at, created_at)
       VALUES (?, 'crowd', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      account.id, account.username.toLowerCase(), account.displayName, account.avatar, followers, randomInt(120, 1400),
      bit(index < CROWD_FOLLOWING_ME), time - randomInt(30, 10_000) * MINUTE, time,
    )
  })
}

/**
 * Three group chats, created empty (the simulation fills them right away): the besties, four
 * friends, and an interest group from my first interest with the three characters who share it most.
 */
function seedGroups(cast: CastPersona[], interests: string[]): void {
  const withRole = (role: Role) => cast.filter((persona) => persona.role === role).map((persona) => persona.id)
  const group = (title: string, emoji: string, memberIds: string[], vibe: string) => {
    if (memberIds.length >= 2) createGroup({ title, emoji, memberIds, vibe })
  }

  group('the besties 💌', '💌', withRole('bestie').slice(0, 4), 'inner circle, chaotic, supportive')
  const [friendsTitle, friendsEmoji] = pick(FRIEND_GROUP_NAMES)
  group(friendsTitle, friendsEmoji, sample(withRole('friend'), 4), 'plans, memes, sports')

  const interest = interests[0]?.trim().toLowerCase()
  if (interest) {
    const members = shuffle(cast.filter((persona) => persona.role !== 'creator'))
      .map((persona) => ({ id: persona.id, score: interestScore([interest], (persona.interests ?? []).join(', ')) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((member) => member.id)
    group(`${interest} club`, interestEmoji(interest), members, `everyone here loves ${interest}: finds, recs and plans`)
  }
}

/** "lily.tran and 2,312 others started following you": the followers I had before arriving. */
function seedFirstFollowers(cast: CastPersona[], tier: Tier, time: number): void {
  const fans = cast.filter((persona) => persona.role === 'fan')
  const actor = fans.length > 0 ? pick(fans) : cast.find((persona) => persona.role !== 'creator')
  const others = Math.round(TIERS[tier].followers * randomBetween(0.78, 0.86))
  q(`INSERT INTO notifications (id, kind, actor_id, others, group_key, read, created_at) VALUES (?, 'follow', ?, ?, ?, 0, ?)`)
    .run(newId('n'), actor?.id ?? null, others, followGroupKey(time), time - 2 * MINUTE)
}

function saveSettings(request: OnboardingRequest): void {
  setSetting('tier', request.tier)
  setSetting('speed', 'fast')
  setSetting('model', 'opus')
  setSetting('interests', request.interests)
  setSetting('origin', request.origin)
  setSetting('aura', 0)
  setSetting('onboarded', true)
}
