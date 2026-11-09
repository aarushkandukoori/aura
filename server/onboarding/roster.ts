/**
 * The characters a sign-up plan can pick as the user's people: the cast's besties, friends and
 * mutuals. Fans have never met the user and creators are celebrities, so they keep their roles.
 * Everything comes from content/cast.json, because the plan is made before the world (and its
 * database rows) exist.
 */
import type { CastPersona } from '../../shared/cast.ts'
import type { Account, Role } from '../../shared/types.ts'
import { loadContent } from '../seed/content.ts'

const PICKABLE: Role[] = ['bestie', 'friend', 'mutual']

/** Characters the plan may choose from, in content order. */
export function pickableCast(cast: CastPersona[] = loadContent().cast): CastPersona[] {
  return cast.filter((persona) => PICKABLE.includes(persona.role))
}

/**
 * One character in four lines for the plan prompt, e.g.
 *   [tyler] Tyler Brennan, 30, he/him · Physical therapist, Denver, CO · now: friend
 *     Who: Irish-American gym buddy and physical therapist who spots the user...
 *     Into: powerlifting, trail running, meal prep, mountain hikes
 *     Types: Short bursts with no punctuation...
 */
export function rosterLine(persona: CastPersona): string {
  return [
    `[${persona.id}] ${persona.displayName}, ${persona.age}, ${persona.pronouns} · ${persona.occupation}, ${persona.location} · now: ${persona.role}`,
    `  Who: ${persona.concept}`,
    `  Into: ${persona.interests.join(', ')}`,
    `  Types: ${persona.voice}`,
  ].join('\n')
}

/** The Account the review screen shows for a chosen character, with the role the plan gives them. */
export function previewAccount(persona: CastPersona, role: Role): Account {
  return {
    id: persona.id,
    kind: 'cast',
    username: persona.username.toLowerCase(),
    displayName: persona.displayName,
    avatar: persona.avatar?.file ?? null,
    verified: persona.verified,
    role,
    followsMe: true,
    iFollow: true,
    hasStory: false,
    storySeen: false,
    lastActiveAt: null,
  }
}

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? ''
