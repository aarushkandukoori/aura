/**
 * Exponential time decay: what you liked recently counts more than what you liked last month.
 *
 * Every score (how much you like an account or a topic) loses half its value every HALF_LIFE.
 * A like today counts 2, the same like three days ago counts 1, six days ago 0.5, and so on.
 *
 * We never store a list of old events to add up. Each score is kept as two numbers: its value and
 * when that value was last updated. Reading it later, or adding a new event to it, first brings
 * the old value forward in time by multiplying it by the decay for the time that passed.
 */

export const HOUR_MS = 60 * 60 * 1000
export const DAY_MS = 24 * HOUR_MS

/** A score halves every three days, so a week of not caring about a topic mostly forgets it. */
export const HALF_LIFE_MS = 3 * DAY_MS

/** A score as stored: its value as of `at` (ms since 1970). */
export interface Decayed {
  value: number
  at: number
}

/** How much of a value is left after `elapsedMs`: 1 now, 0.5 after one half-life, 0.25 after two. */
export function decayFactor(elapsedMs: number, halfLifeMs = HALF_LIFE_MS): number {
  return elapsedMs <= 0 ? 1 : 0.5 ** (elapsedMs / halfLifeMs)
}

/** What a stored score is worth at time `now`. */
export function valueAt(score: Decayed, now: number, halfLifeMs = HALF_LIFE_MS): number {
  return score.value * decayFactor(now - score.at, halfLifeMs)
}

/**
 * Add an event of `weight` that happened at `eventAt` to a score. Events can arrive a little out of
 * order (apps send them in batches), so both sides are brought to the later of the two times.
 */
export function addEvent(score: Decayed | null, weight: number, eventAt: number, halfLifeMs = HALF_LIFE_MS): Decayed {
  if (!score) return { value: weight, at: eventAt }
  const at = Math.max(score.at, eventAt)
  return {
    value: score.value * decayFactor(at - score.at, halfLifeMs) + weight * decayFactor(at - eventAt, halfLifeMs),
    at,
  }
}
