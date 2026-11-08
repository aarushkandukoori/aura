/**
 * Small random helpers.
 *
 * Real randomness (Math.random) is used when something happens once, like building the world.
 * "Stable" randomness (a hash of some text) is used for things that must look the same on every
 * request, like who follows whom, so a profile never reshuffles when you reopen it.
 */

/** A whole number from min to max, both included. */
export function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

/** A decimal number from min (included) to max (excluded). */
export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** true with the given probability (0..1). */
export function chance(probability: number): boolean {
  return Math.random() < probability
}

export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

/** A shuffled copy (Fisher-Yates), the input is left alone. */
export function shuffle<T>(list: readonly T[]): T[] {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Up to `count` different items, in random order. */
export function sample<T>(list: readonly T[], count: number): T[] {
  return shuffle(list).slice(0, Math.max(0, count))
}

/** The same text always gives the same number in [0, 1) (FNV-1a hash). */
export function stableFraction(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}
