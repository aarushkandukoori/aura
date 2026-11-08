/**
 * The simulation: everything the AI world does on its own or in reaction to the user.
 *
 * API routes call these hooks right after the user does something (posts, comments, sends a DM...).
 * Every hook returns immediately: it only adds jobs to the `jobs` table (scheduler.ts), and the
 * jobs do the work later: likes that trickle in, comments, replies, DMs, new followers,
 * characters posting their own content, group chats chatting. AI runs only inside jobs.
 * Hooks also note that the user is around, which keeps the world's own AI events going (world.ts).
 */
import type { Speed } from '../../shared/types.ts'
import { SPEEDS } from '../config.ts'
import { now } from '../db/index.ts'
import { randomBetween } from '../repo/random.ts'
import { clearChatLocks } from './chats.ts'
import { HANDLERS, REAL_TIME_KINDS } from './handlers.ts'
import { hasPending, postpone, rescalePending, schedule, startScheduler, stopScheduler } from './scheduler.ts'
import { chatDelay, currentSpeed, debounceDelay, seenDelay, simDelay } from './time.ts'
import { noteUserActive, startWorld, stopWorld } from './world.ts'

/** The speed the waiting jobs were planned with (to rescale them when it changes). */
let plannedSpeed: Speed | null = null

/** Start the scheduler loop. Called once by server/index.ts after the HTTP server is listening. */
export function start(): void {
  plannedSpeed = currentSpeed()
  startScheduler(HANDLERS)
  startWorld()
}

/** Stop timers (tests, shutdown, Start over). Safe to call when it never started. */
export function stop(): void {
  stopScheduler()
  stopWorld()
  clearChatLocks()
}

/** The user just finished onboarding: welcome DMs, group chat greetings, first followers. */
export function onOnboarded(): void {
  noteUserActive()
  schedule('welcome', 1_000)
  // The first few minutes are busy, so the world feels alive right away.
  schedule('world_event', 45_000, { event: 'cast_story' })
  schedule('world_event', 75_000, { event: 'cast_post' })
  schedule('world_event', 110_000, { event: 'followers' })
  schedule('world_event', 150_000, { event: 'cast_post' })
  schedule('world_event', 200_000, { event: 'cast_story' })
  schedule('world_event', 260_000, { event: 'followers' })
}

/** The user published a post. Plan its likes, comments, DMs and follower bump. */
export function onUserPost(postId: string): void {
  noteUserActive()
  schedule('post_react', 0, { postId })
}

/** The user posted a story. Plan its views and reactions. */
export function onUserStory(storyId: string): void {
  noteUserActive()
  schedule('story_react', 0, { storyId })
}

/** The user commented (or replied) on any post. */
export function onUserComment(commentId: string): void {
  noteUserActive()
  schedule('user_comment', 0, { commentId })
}

/** The user liked someone's post. */
export function onUserLikedPost(postId: string): void {
  noteUserActive()
  schedule('user_liked', simDelay(randomBetween(0.5, 3)), { postId })
}

/** The user followed an account. Following, unfollowing and following again still plans one follow-back. */
export function onUserFollow(accountId: string): void {
  noteUserActive()
  if (!hasPending('user_follow', 'accountId', accountId)) schedule('user_follow', simDelay(randomBetween(1, 10)), { accountId })
}

/**
 * The user sent a message (DM, group chat, story reply or shared post). The other side "sees" it
 * after a few seconds and answers; several quick messages get one answer, ~3 s after the last.
 */
export function onUserMessage(conversationId: string, _messageId: string): void {
  noteUserActive()
  if (!postpone('chat_reply', 'conversationId', conversationId, now() + debounceDelay())) {
    schedule('chat_reply', Math.max(seenDelay(), debounceDelay()), { conversationId })
  }
}

/**
 * The user opened a conversation and read it. A friend left on read may nudge them later.
 * (Not counted as being around: the apps send read receipts on their own while a chat is open.)
 */
export function onUserReadConversation(conversationId: string): void {
  if (!hasPending('read_nudge', 'conversationId', conversationId)) {
    schedule('read_nudge', chatDelay(180, 360), { conversationId })
  }
}

/** Tier, speed or model changed in Settings. A new speed moves the waiting sim-time jobs. */
export function onSettingsChanged(): void {
  noteUserActive()
  const speed = currentSpeed()
  if (plannedSpeed && speed !== plannedSpeed) rescalePending(SPEEDS[speed].factor / SPEEDS[plannedSpeed].factor, REAL_TIME_KINDS)
  plannedSpeed = speed
}
