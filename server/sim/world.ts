/**
 * The world living on its own while someone has the app open: characters post and put up
 * stories, group chats talk, close friends text first, followers drift in, older posts get late
 * likes, and once in a while a big creator notices the user. Coming back after 10+ minutes away
 * catches up with a few things at once ("while you were away").
 *
 * The events that use AI or the characters' posts and stories only happen while the user is
 * around (did something in the last 15 minutes, or just opened the app). A tab left open
 * overnight only gets followers and likes, so it never spends AI calls or empties the library.
 *
 * Each world has its own loop (a world_tick job in its jobs table) that runs while an app is open
 * on that world: the first app to connect starts it, and it stops after the last one closes.
 */
import type { Tier } from '../../shared/types.ts'
import { groupChatter } from '../ai/tasks.ts'
import { getSetting, now, q, setSetting, worldState } from '../db/index.ts'
import { clientCount, onPresenceChange } from '../live.ts'
import { pickLibraryPost, pickLibraryStory } from '../recs/index.ts'
import {
  addFollowers, addPostLikes, bumpAura, followBack, getCast, getConversationRow, getLibraryPosts, getLibraryStories,
  isOnboarded, listConversations, recycleStories, releasePost, releaseStory, touchActive,
} from '../repo/index.ts'
import { chance, pick, randomInt } from '../repo/random.ts'
import { dmOpenerAllowed, startDm } from './chats.ts'
import { characterFor, chatHistory, DEFAULT_VIBE, isClose, userInfo } from './context.ts'
import { auraFor, followerTrickle, lateLikes } from './curve.ts'
import { creatorBanner, planCastPost } from './posts.ts'
import { hasPending, hasWaiting, schedule } from './scheduler.ts'

const MINUTE = 60_000
const AWAY_MS = 10 * MINUTE
const CHATTER_GAP_MS = 4 * MINUTE
/** A group with this many unread messages waits for the user before chatting again. */
const CHATTER_UNREAD_LIMIT = 6
/** At most one character post every 8 minutes from the world loop, so their library lasts. */
const CAST_POST_GAP_MS = 8 * MINUTE
/** After this long without the user doing anything, only the free background events happen. */
const IDLE_AFTER_MS = 15 * MINUTE

const currentTier = () => getSetting<Tier>('tier', 'popular')

// ----- is the user around? ------------------------------------------------------------------------

/** Per world: when the user last did something, when the loop last released a character post, and whether an app is open. */
const loopState = worldState(() => ({ lastUserActionAt: 0, lastCastPostAt: 0, connected: false }))

/**
 * The user just did something (posted, commented, sent a message, followed, liked) or opened the
 * app. Read receipts don't count: the apps send those on their own while a chat is open.
 */
export function noteUserActive(): void {
  loopState().lastUserActionAt = now()
}

const userIsAround = () => now() - loopState().lastUserActionAt < IDLE_AFTER_MS

// ----- the events -----------------------------------------------------------------------------

/**
 * A character posts one of their library posts, which then collects likes and comments. Which one
 * is up to the recommendation algorithm: the next post of whoever the user would most enjoy
 * (people they follow first, so it reaches their feed), with some chance mixed in.
 */
async function castPosts(): Promise<boolean> {
  const row = pickLibraryPost(getLibraryPosts())
  const post = row ? releasePost(row.id) : null
  if (!post) return false
  loopState().lastCastPostAt = now()
  planCastPost(post.id)
  return true
}

/** A character puts up one of their library stories. Stories only last a day, so used ones come back around. */
async function castStory(): Promise<boolean> {
  let library = getLibraryStories()
  if (library.length === 0 && recycleStories() > 0) library = getLibraryStories()
  const row = pickLibraryStory(library) // the same way as posts: what the user would enjoy most
  return row ? releaseStory(row.id) !== null : false
}

/**
 * A group chat talks among itself for a bit, sometimes pulling the user in (at most every 4
 * minutes, and not in a group that already has a pile of messages the user hasn't read).
 */
async function groupTalks(): Promise<boolean> {
  if (now() - getSetting('simLastChatterAt', 0) < CHATTER_GAP_MS) return false
  const groups = listConversations()
    .filter((chat) => chat.kind === 'group' && chat.members.length >= 2 && chat.unread < CHATTER_UNREAD_LIMIT)
  const user = userInfo()
  if (groups.length === 0 || !user) return false
  const group = pick(groups)
  setSetting('simLastChatterAt', now()) // before the AI call, so two events can't both start chatting
  const { lines } = await groupChatter({
    user,
    title: group.title,
    vibe: getConversationRow(group.id)?.vibe ?? DEFAULT_VIBE,
    members: group.members.flatMap((member) => characterFor(member.id) ?? []),
    history: chatHistory(group.id, 20),
    askUser: chance(0.45),
  })
  if (lines.length === 0) return false
  schedule('group_lines', 0, { conversationId: group.id, lines })
  return true
}

/** A close friend texts the user first, unless they spoke last in that chat (no double texting). */
async function friendTextsFirst(): Promise<boolean> {
  if (!dmOpenerAllowed()) return false
  const spokeLast = new Set(listConversations()
    .filter((chat) => chat.kind === 'dm' && chat.lastMessage && chat.lastMessage.sender.kind !== 'me')
    .map((chat) => chat.members[0]?.id))
  const friends = getCast().filter((member) => isClose(member) && !spokeLast.has(member.id))
  if (friends.length === 0) return false
  // getCast() is closest first; the closest eight text the most.
  await startDm(pick(friends.slice(0, 8)), null)
  return true
}

/** A few new followers drift in. */
async function newFollowers(): Promise<boolean> {
  const count = followerTrickle(currentTier())
  addFollowers([], count)
  bumpAura(auraFor({ followers: count }))
  return true
}

function likedBy(postId: string, accountId: string): boolean {
  return q('SELECT 1 FROM post_likes WHERE post_id = ? AND account_id = ?').get(postId, accountId) !== undefined
}

/** Someone scrolls back through my profile: an older post of mine gets a few late likes. */
async function lateLikesOnOldPost(): Promise<boolean> {
  const posts = q("SELECT id FROM posts WHERE author_id = 'me' AND released = 1 AND created_at < ?")
    .all(now() - 30 * MINUTE) as { id: string }[]
  if (posts.length === 0) return false
  const postId = pick(posts).id
  const notYet = getCast().filter((member) => member.role !== 'creator' && !likedBy(postId, member.id))
  const named = notYet.length > 0 && chance(0.5) ? [pick(notYet).id] : []
  const likes = lateLikes(currentTier())
  addPostLikes(postId, Math.max(0, likes - named.length), named)
  bumpAura(auraFor({ likes }))
  return true
}

/** Rare: a big creator follows the user, or likes their latest post. */
async function creatorNotices(): Promise<boolean> {
  const creators = getCast().filter((member) => member.role === 'creator')
  const strangers = creators.filter((member) => !member.followsMe)
  if (strangers.length > 0 && chance(0.6)) {
    const creator = pick(strangers)
    followBack(creator.id)
    creatorBanner(creator, 'started following you', `/${creator.username}`)
    return true
  }
  const latest = q("SELECT id FROM posts WHERE author_id = 'me' AND released = 1 ORDER BY created_at DESC LIMIT 1")
    .get() as { id: string } | undefined
  const fans = latest ? creators.filter((member) => !likedBy(latest.id, member.id)) : []
  if (!latest || fans.length === 0) return false
  const creator = pick(fans)
  addPostLikes(latest.id, 0, [creator.id])
  creatorBanner(creator, 'liked your post', `/p/${latest.id}`)
  return true
}

/**
 * Every kind of event, how often it happens, and what it does. run() returns false if it can't
 * happen now. needsUser: it uses AI or the characters' library, so it only happens while the user is around.
 */
const EVENTS = {
  cast_post: { weight: 24, needsUser: true, run: castPosts },
  cast_story: { weight: 16, needsUser: true, run: castStory },
  group_chatter: { weight: 18, needsUser: true, run: groupTalks },
  dm_opener: { weight: 12, needsUser: true, run: friendTextsFirst },
  followers: { weight: 14, needsUser: false, run: newFollowers },
  old_post_like: { weight: 10, needsUser: false, run: lateLikesOnOldPost },
  creator_notice: { weight: 3, needsUser: false, run: creatorNotices },
}
type WorldEvent = keyof typeof EVENTS

function weightedPick(names: WorldEvent[]): WorldEvent {
  let roll = Math.random() * names.reduce((sum, name) => sum + EVENTS[name].weight, 0)
  for (const name of names) {
    roll -= EVENTS[name].weight
    if (roll < 0) return name
  }
  return names[names.length - 1]
}

/** Run one random event, trying others when the first pick can't happen right now. */
async function runRandomEvent(skip: WorldEvent[] = []): Promise<WorldEvent | null> {
  const options = (Object.keys(EVENTS) as WorldEvent[]).filter((name) => !skip.includes(name))
  while (options.length > 0) {
    const name = weightedPick(options)
    if (await EVENTS[name].run()) return name
    options.splice(options.indexOf(name), 1)
  }
  return null
}

// ----- jobs -----------------------------------------------------------------------------------

/** While the user is away: one roll over every event, and only the free ones happen (at their usual rate). */
async function quietEvent(): Promise<void> {
  const name = weightedPick(Object.keys(EVENTS) as WorldEvent[])
  if (!EVENTS[name].needsUser) await EVENTS[name].run()
}

/** Job world_tick: every 40-120 s, while someone has the app open, one thing happens in the world. */
export async function worldTick(): Promise<void> {
  // With no app open the loop stops here; the next app to connect starts it again (presenceChanged).
  // Otherwise it always continues, even if this event fails. A tick that runs again after a
  // restart finds its successor already waiting, so a restart never starts a second loop.
  if (clientCount() === 0) return
  if (!hasWaiting('world_tick')) schedule('world_tick', randomInt(40, 120) * 1000)
  if (!isOnboarded()) return
  setSetting('lastSeenAt', now())
  try {
    // Friends drift online and offline ("Active now").
    const friends = getCast().filter(isClose)
    if (friends.length > 0 && chance(0.4)) touchActive(pick(friends).id)
    if (!userIsAround()) {
      await quietEvent()
    } else {
      // Right after a character posted, the others wait a few minutes before posting too.
      await runRandomEvent(now() - loopState().lastCastPostAt < CAST_POST_GAP_MS ? ['cast_post'] : [])
    }
  } catch (error) {
    // Swallowed on purpose: a retry of this job would start a second loop.
    console.error('[sim] world event failed:', error)
  }
}

/** Job world_event: one specific event now (used to make the first minutes after onboarding busy). */
export async function worldEvent({ event }: { event: string }): Promise<void> {
  if (isOnboarded() && event in EVENTS) await EVENTS[event as WorldEvent].run()
}

/** Job catch_up: the user is back after a while, so 2-3 different things happen at once. */
export async function catchUp(): Promise<void> {
  const done: WorldEvent[] = []
  for (let i = randomInt(2, 3); i > 0; i--) {
    const name = await runRandomEvent(done)
    if (name) done.push(name)
  }
}

// ----- presence -------------------------------------------------------------------------------

let unsubscribe: (() => void) | null = null

/** Start the current world's loop unless it is already running. */
function startLoop(): void {
  if (!hasPending('world_tick')) schedule('world_tick', 20_000)
}

/**
 * Apps connecting to and disconnecting from a world (runs inside that world). An open app keeps
 * the loop going; opening the app counts as being around; coming back after AWAY_MS schedules a catch-up.
 */
function presenceChanged(count: number): void {
  if (count > 0) startLoop()
  if (!isOnboarded()) return
  const state = loopState()
  const time = now()
  if (count > 0 && !state.connected) {
    noteUserActive()
    if (time - getSetting('lastSeenAt', time) >= AWAY_MS) schedule('catch_up', 1_500)
  }
  state.connected = count > 0
  setSetting('lastSeenAt', time)
}

export function startWorld(): void {
  unsubscribe?.()
  unsubscribe = onPresenceChange(presenceChanged)
}

export function stopWorld(): void {
  unsubscribe?.()
  unsubscribe = null
}

/** After Start over: the loop's job was wiped with everything else, so start it again if an app is open. */
export function restartWorldLoop(): void {
  const open = clientCount() > 0
  loopState().connected = open
  if (open) startLoop()
}
