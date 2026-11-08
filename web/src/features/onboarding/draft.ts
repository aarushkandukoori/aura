/**
 * The answers collected during onboarding, and which step needs what before you can continue.
 */
import type { OnboardingRequest, Tier } from '../../lib/types'
import { MIN_INTERESTS, usernameError } from './options'

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
}

export type Step = 'welcome' | 'name' | 'photo' | 'about' | 'origin' | 'tier' | 'building'

export const STEPS: Step[] = ['welcome', 'name', 'photo', 'about', 'origin', 'tier', 'building']

/** The steps shown on the progress bar (the welcome screen and the building moment are not). */
export const PROGRESS_STEPS: Step[] = ['name', 'photo', 'about', 'origin', 'tier']

/** Can the person move on from this step? */
export function canContinue(step: Step, draft: Draft): boolean {
  switch (step) {
    case 'name':
      return draft.displayName.trim().length > 0 && usernameError(draft.username) === null
    case 'about':
      return draft.interests.length >= MIN_INTERESTS
    case 'origin':
      return draft.origin !== ''
    default:
      return true
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
    origin: draft.origin,
  }
}
