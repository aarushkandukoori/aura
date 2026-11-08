/**
 * Display info for the popularity tiers, world speeds and AI models.
 *
 * The tier numbers mirror TIERS in server/config.ts (the browser can't import server code), so
 * the cards show the same follower counts the server will give you.
 */
import type { AiModel, Speed, Tier } from '../../lib/types'

export interface TierOption {
  value: Tier
  label: string
  /** Starting follower count for this tier. */
  followers: number
  blurb: string
  emoji: string
  /** Toast shown after switching to this tier in Settings. */
  switched: string
}

export const TIER_OPTIONS: TierOption[] = [
  { value: 'rising', label: 'Rising', followers: 2_800, blurb: 'Local legend. Everyone knows your name.', emoji: '🌱', switched: "You're on the rise" },
  { value: 'popular', label: 'Popular', followers: 48_000, blurb: 'Campus famous. Your posts are an event.', emoji: '✨', switched: "You're popular now" },
  { value: 'influencer', label: 'Influencer', followers: 620_000, blurb: 'Brands DM you. Strangers know your face.', emoji: '💫', switched: 'Influencer status unlocked' },
  { value: 'icon', label: 'Icon', followers: 8_400_000, blurb: 'A household name. Every post breaks the internet.', emoji: '👑', switched: "You're an icon now" },
]

export function tierOption(tier: Tier): TierOption {
  return TIER_OPTIONS.find((option) => option.value === tier) ?? TIER_OPTIONS[1]
}

/** Matches SPEEDS in server/config.ts: fast = 0.08 (an hour in ~5 min), instant = 0.015 (~1 min). */
export const SPEED_OPTIONS: { value: Speed; label: string; hint: string }[] = [
  { value: 'realtime', label: 'Real time', hint: 'Reactions arrive over hours, like real life.' },
  { value: 'fast', label: 'Fast', hint: 'An hour of reactions arrives in about five minutes.' },
  { value: 'instant', label: 'Instant', hint: 'An hour of reactions arrives in about a minute.' },
]

export const MODEL_OPTIONS: { value: AiModel; label: string; hint: string }[] = [
  { value: 'opus', label: 'Opus', hint: 'Claude Opus writes the most thoughtful comments and replies.' },
  { value: 'sonnet', label: 'Sonnet', hint: 'Claude Sonnet is quick and still sharp.' },
  { value: 'haiku', label: 'Haiku', hint: 'Claude Haiku replies the fastest.' },
]
