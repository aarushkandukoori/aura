/**
 * Building the world from the plan the user reviewed at sign-up (server/onboarding/plan.ts):
 * - the characters they chose get their new roles, the story of how they know the user, and a
 *   "who they are" line without the old story (so nobody is two people at once);
 * - besties and friends they didn't choose become people they know a little;
 * - the group chats are the plan's;
 * - every character knows the facts the user shared;
 * - the friends nobody in the cast fits are queued to join in the background (new-friends.ts).
 */
import type { CastPersona } from '../../shared/cast.ts'
import type { Role, WorldPlan } from '../../shared/types.ts'
import { getSetting, setSetting } from '../db/index.ts'
import { cleanPlan } from '../onboarding/clean.ts'
import { planNewFriends } from '../onboarding/new-friends.ts'
import { PLAN_CONCEPTS_KEY } from '../onboarding/plan.ts'
import { firstNameOf } from '../onboarding/roster.ts'
import { addMemory, createGroup } from '../repo/index.ts'
import { escapeRegex } from '../repo/text.ts'

/** A character with the plan applied, and how close they are to the user (the plan's order counts). */
export interface PlannedPersona {
  persona: CastPersona
  closeness: number | null
}

/** Someone who used to be in the inner circle but isn't in the plan: still warm, just not close now. */
const DRIFTED = "Was close with the user a while back; these days they mostly keep up through posts and comments, and it's warm every time."

/** The plan, checked again (an app could send anything). */
export function checkedPlan(plan: unknown, cast: CastPersona[]): WorldPlan {
  return cleanPlan(plan, { cast })
}

/**
 * Every character with the plan applied. Closeness follows the plan's order (the first bestie is
 * the closest), which also decides who sends the first welcome DMs.
 */
export function castWithPlan(cast: CastPersona[], plan: WorldPlan): PlannedPersona[] {
  const concepts = getSetting<Record<string, string>>(PLAN_CONCEPTS_KEY, {})
  const firstNames = new Set(cast.map((persona) => firstNameOf(persona.displayName)))
  const userName = firstNameOf(plan.displayName)
  return cast.map((persona) => {
    const index = plan.friends.findIndex((friend) => friend.id === persona.id)
    const friend = plan.friends[index]
    if (friend) {
      const sameRole = plan.friends.slice(0, index).filter((other) => other.role === friend.role).length
      return {
        persona: {
          ...persona,
          role: friend.role,
          relationship: aboutTheUser(friend.relationship, userName, firstNames),
          concept: concepts[persona.id] ?? persona.concept,
        },
        closeness: (friend.role === 'bestie' ? 0.95 : 0.75) - sameRole * 0.01,
      }
    }
    if (persona.role === 'bestie' || persona.role === 'friend') {
      return { persona: { ...persona, role: 'mutual' as Role, relationship: DRIFTED }, closeness: null }
    }
    return { persona, closeness: null }
  })
}

/**
 * The plan writes "Sam's gym partner" with the user's first name; the world stores "the user's gym
 * partner", so prompts still read right after a name change (personaCard puts the name back in).
 * Skipped when a character shares the user's first name, where it would mix the two up.
 */
function aboutTheUser(text: string, userFirstName: string, castFirstNames: Set<string>): string {
  if (userFirstName.length < 2 || castFirstNames.has(userFirstName)) return text
  return text.replace(new RegExp(`\\b${escapeRegex(userFirstName)}\\b`, 'g'), 'the user')
}

/** The plan's group chats, the facts everyone knows, who the plan's besties are, and the new friends' queue. */
export function seedPlan(plan: WorldPlan): void {
  for (const group of plan.groupChats) createGroup({ title: group.title, emoji: group.emoji, memberIds: group.memberIds, vibe: group.vibe })
  // Newest first is how prompts read memories, so the first (most important) fact goes in last.
  for (const fact of [...plan.memories].reverse()) addMemory('*', fact)
  setSetting('worldPlan', { besties: plan.friends.filter((friend) => friend.role === 'bestie').map((friend) => friend.id) })
  planNewFriends(plan.newFriends)
}
