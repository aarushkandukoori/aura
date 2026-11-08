/**
 * Engagement math: how many likes, views, followers and comments arrive, and when.
 *
 * Everything here is a plain function with no database access, so the tests can check the
 * numbers directly. Times are in sim minutes (time.ts turns them into real milliseconds).
 */
import type { Tier } from '../../shared/types.ts'
import { TIERS } from '../config.ts'
import { randomBetween, randomInt } from '../repo/random.ts'

/** When the waves of likes on a new post land, in sim minutes after posting (SPEC 6). */
export const LIKE_WAVES = [
  0.3, 0.6, 1, 1.5, 2, 3, 4, 5, 7, 9, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 130, 160, 200, 250, 300, 360,
]

/** Story views come faster and stop sooner than likes. */
export const VIEW_WAVES = [0.2, 0.5, 1, 2, 3, 5, 8, 12, 18, 25, 35, 50, 70, 90, 120, 160, 200, 240]

/**
 * The share of everything that has arrived t sim minutes in: 1 - e^(-t/25). It climbs fast at
 * first and then flattens out, like a real post that gets most of its likes in the first hour.
 * timeConstant: about 63% has arrived after this many sim minutes (half after ~0.7 of it).
 */
function arrivedBy(t: number, timeConstant = 25): number {
  return 1 - Math.exp(-t / timeConstant)
}

/** What fraction of the total each wave carries. The last wave counts as "done", so they add up to 1. */
export function waveShares(waves: number[], timeConstant = 25): number[] {
  const end = arrivedBy(waves[waves.length - 1], timeConstant)
  return waves.map((t, index) => {
    const before = index === 0 ? 0 : arrivedBy(waves[index - 1], timeConstant)
    return (arrivedBy(t, timeConstant) - before) / end
  })
}

/**
 * Split a whole number into parts that follow the shares and add up to exactly the total.
 * Each part is rounded down first; the leftovers go to the parts that lost the most.
 */
export function splitByShares(total: number, shares: number[]): number[] {
  const exact = shares.map((share) => share * total)
  const parts = exact.map(Math.floor)
  let left = total - parts.reduce((sum, part) => sum + part, 0)
  const biggestRemainders = exact
    .map((value, index) => ({ index, remainder: value - parts[index] }))
    .sort((a, b) => b.remainder - a.remainder)
  for (let i = 0; left > 0; i++, left--) parts[biggestRemainders[i % parts.length].index]++
  return parts
}

/** A random whole number inside a [min, max] range from config.ts. */
export function inRange([min, max]: [number, number]): number {
  return randomInt(min, max)
}

/** Total likes a post of mine gets before the AI's hype: a random amount for my tier. */
export function baseLikes(tier: Tier): number {
  return inRange(TIERS[tier].likes)
}

/** New followers a post brings: 1-3% of its likes. */
export function followersFromLikes(likes: number): number {
  return Math.round(likes * randomBetween(0.01, 0.03))
}

/** Likes on a character's post (seeded or posted later): regular people 4-15% of followers, creators 1-5%. */
export function castPostLikes(followers: number, isCreator: boolean): number {
  const rate = isCreator ? randomBetween(0.01, 0.05) : randomBetween(0.04, 0.15)
  return Math.max(3, Math.round(followers * rate))
}

/**
 * When `count` comments land, front-loaded over about `span` sim minutes. The first one arrives
 * after 0.5-2 minutes; squaring an even spread bunches the early ones together, the way comments
 * pile up while a post is fresh. Returned oldest first.
 */
export function commentTimes(count: number, span = 90): number[] {
  const times: number[] = []
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      times.push(randomBetween(0.5, 2))
      continue
    }
    const spread = (i / Math.max(1, count - 1)) ** 2
    times.push(2 + spread * (span - 2) * randomBetween(0.8, 1.1))
  }
  return times.sort((a, b) => a - b)
}

/** A reply lands 2-10 sim minutes after the comment it answers. */
export function replyLag(): number {
  return randomBetween(2, 10)
}

/** Followers that drift in on their own: a tiny slice of the tier's audience (at least one). */
export function followerTrickle(tier: Tier): number {
  return Math.max(1, Math.round(TIERS[tier].followers * randomBetween(0.0001, 0.0006)))
}

/** Late likes on an older post: a sliver of what a fresh post gets. */
export function lateLikes(tier: Tier): number {
  return Math.max(1, Math.round(TIERS[tier].likes[0] * randomBetween(0.002, 0.01)))
}

/** How often a big creator notices a post of mine. Bigger accounts get noticed more. */
export const CREATOR_NOTICE_CHANCE: Record<Tier, number> = { rising: 0.2, popular: 0.25, influencer: 0.4, icon: 0.6 }

/** Aura is a playful score: every like, comment, follower and view adds a little. */
export const AURA = { perLike: 0.2, perComment: 6, perFollower: 1, perView: 0.05 }

export function auraFor(gained: { likes?: number; comments?: number; followers?: number; views?: number }): number {
  return Math.round(
    (gained.likes ?? 0) * AURA.perLike
    + (gained.comments ?? 0) * AURA.perComment
    + (gained.followers ?? 0) * AURA.perFollower
    + (gained.views ?? 0) * AURA.perView,
  )
}
