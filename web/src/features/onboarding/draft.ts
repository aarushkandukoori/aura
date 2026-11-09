/**
 * The answers collected during onboarding, the order of the steps, and which step needs what
 * before you can continue.
 *
 * Two paths lead to "Build my world":
 * - describe: tell us about your world -> the plan loads ("planning") -> review it -> building
 * - manual ("Set it up myself"): name -> photo -> bio + interests -> how you know them -> popularity -> building
 */
import type { OnboardingRequest, SignedInAccount, Tier, WorldPlan } from '../../lib/types'
import { MAX_INTERESTS, MIN_INTERESTS, suggestUsername, usernameError } from './options'

export interface Draft {
  displayName: string
  username: string
  /** Once the person types their own username we stop suggesting one from their name. */
  usernameEdited: boolean
  pronouns: string
  avatar: string | null
  bio: string
  interests: string[]
  origin: string
  tier: Tier
  /** What they said or typed about their world. */
  transcript: string
  /** The plan made from it (null on the manual path). */
  plan: WorldPlan | null
}

export const EMPTY_DRAFT: Draft = {
  displayName: '',
  username: '',
  usernameEdited: false,
  pronouns: '',
  avatar: null,
  bio: '',
  interests: [],
  origin: '',
  tier: 'popular',
  transcript: '',
  plan: null,
}

export type Step = 'welcome' | 'describe' | 'planning' | 'review' | 'name' | 'photo' | 'about' | 'origin' | 'tier' | 'building'

/** Every step in order; steps slide in from the side you're heading to. */
export const STEPS: Step[] = ['welcome', 'describe', 'planning', 'review', 'name', 'photo', 'about', 'origin', 'tier', 'building']

/** The manual path's questions, shown on the progress bar. */
export const PROGRESS_STEPS: Step[] = ['name', 'photo', 'about', 'origin', 'tier']

/** Where Next goes on the simple steps (the others start something: a plan or the build). */
export const NEXT: Partial<Record<Step, Step>> = { welcome: 'describe', name: 'photo', photo: 'about', about: 'origin', origin: 'tier' }

/** Where Back goes (from "planning" it cancels the plan, to change what you said). */
export const BACK: Partial<Record<Step, Step>> = {
  describe: 'welcome', planning: 'describe', review: 'describe', name: 'describe', photo: 'name', about: 'photo', origin: 'about',
  tier: 'origin',
}

/** A few words at least, so there's something to build from. */
export const MIN_TRANSCRIPT = 12

/** Can the person move on from this step? */
export function canContinue(step: Step, draft: Draft): boolean {
  switch (step) {
    case 'describe':
      return draft.transcript.trim().length >= MIN_TRANSCRIPT
    case 'name':
      return draft.displayName.trim().length > 0 && usernameError(draft.username) === null
    case 'about':
      return draft.interests.length >= MIN_INTERESTS
    case 'origin':
      return draft.origin !== ''
    case 'review':
      return canContinue('name', draft) && canContinue('about', draft)
    default:
      return true
  }
}

/** Signed in with Google: start from their name and photo. */
export function startingDraft(account: SignedInAccount | null): Draft {
  const name = (account?.name ?? '').slice(0, 40)
  return { ...EMPTY_DRAFT, displayName: name, username: suggestUsername(name), avatar: account?.picture ?? null }
}

/** The plan arrived: its suggestions fill the review screen (a photo already picked is kept). */
export function withPlan(draft: Draft, plan: WorldPlan): Draft {
  const displayName = plan.displayName || draft.displayName
  return {
    ...draft,
    plan,
    displayName,
    username: plan.username || suggestUsername(displayName),
    usernameEdited: false,
    bio: plan.bio,
    pronouns: plan.pronouns,
    interests: plan.interests.slice(0, MAX_INTERESTS),
    origin: plan.origin,
    tier: plan.tier,
  }
}

/** The POST /api/onboarding body. */
export function toRequest(draft: Draft): OnboardingRequest {
  return {
    displayName: draft.displayName.trim(),
    username: draft.username,
    avatar: draft.avatar,
    bio: draft.bio.trim(),
    pronouns: draft.pronouns.trim(),
    interests: draft.interests,
    tier: draft.tier,
    origin: draft.origin || 'college',
    plan: draft.plan,
  }
}
