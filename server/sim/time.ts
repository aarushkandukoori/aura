/**
 * Simulated time.
 *
 * Reactions to posts and stories run on "sim minutes", which the speed setting squeezes: on
 * "fast" one sim minute passes in about 5 real seconds, on "instant" in under one. Chats ignore
 * the speed and use short real delays instead, so a conversation always feels live.
 */
import type { Speed } from '../../shared/types.ts'
import { SPEEDS } from '../config.ts'
import { getSetting } from '../db/index.ts'
import { randomBetween } from '../repo/random.ts'

const MINUTE = 60_000

export function currentSpeed(): Speed {
  return getSetting<Speed>('speed', 'fast')
}

/** Real milliseconds for a number of simulated minutes at the current speed. */
export function simDelay(simMinutes: number): number {
  return Math.round(simMinutes * MINUTE * SPEEDS[currentSpeed()].factor)
}

/** Chat delays are real time; "instant" plays them at about a third of the normal length. */
function chatScale(): number {
  return currentSpeed() === 'instant' ? 1 / 3 : 1
}

/** A random real delay between two numbers of seconds, scaled for chats. */
export function chatDelay(minSeconds: number, maxSeconds: number): number {
  return Math.round(randomBetween(minSeconds, maxSeconds) * 1000 * chatScale())
}

/** How long before a friend "sees" a message: 2-12 s. */
export function seenDelay(): number {
  return chatDelay(2, 12)
}

/** How long someone types before a bubble appears: 1.5-5 s, longer for longer messages. */
export function typingTime(text: string): number {
  const seconds = Math.min(5, 1.5 + text.length * 0.045)
  return chatDelay(seconds * 0.85, seconds * 1.15)
}

/** A short pause between two bubbles. */
export function bubbleGap(): number {
  return chatDelay(0.5, 1.4)
}

/** If the user sends several messages quickly, the answer waits this long after the last one. */
export function debounceDelay(): number {
  return chatDelay(3, 3)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
