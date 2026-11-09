/**
 * Learning: every signal about what the user likes becomes score changes.
 *
 * A signal on a post (a like, a long look, a reel watched to the end) counts for the post's author
 * and for its topics. A signal on an account (a follow, a profile visit, a story replied to) counts
 * for that account; a search or a hashtag page counts for its topics. Each signal has a weight:
 * how strongly it says "I like this". Skipping things gives small negative weights.
 */
import type { TrackEventType } from '../../shared/types.ts'
import { parseJson, q, tx, worldState } from '../db/index.ts'
import { topicsOfPostId } from './catalog.ts'
import { decayFactor } from './decay.ts'
import { TOPIC_SHARE } from './score.ts'
import { bumpScore, lastEvent, logEvent, markSeen, pruneEvents } from './store.ts'
import { topicsOfInterest } from './topics.ts'

/** What the apps report (TrackEventType) plus what the server sees the user do through the API. */
export type SignalType = TrackEventType
  | 'like' | 'unlike' | 'comment' | 'save' | 'unsave' | 'share' | 'follow' | 'unfollow'
  | 'story_reply' | 'dm_open' | 'message' | 'topic_open'

export interface Signal {
  type: SignalType
  postId?: string | null
  accountId?: string | null
  storyId?: string | null
  conversationId?: string | null
  ms?: number | null
  complete?: boolean | null
  query?: string | null
  tag?: string | null
  at: number
}

/** How much each action says "I like this". */
const WEIGHTS = {
  like: 2,
  comment: 3,
  save: 3,
  share: 4, // sending it to a friend is the strongest thing you can do with a post
  open: 1, // opened the post or its comments
  follow: 3,
  unfollow: -3,
  profile_view: 1,
  story_reply: 2, // replied or reacted to their story
  story_view: 0.3, // watched their story
  story_skip: -0.3, // tapped past it within 1.5 s
  dm_open: 0.5, // opened a chat with them (each member of a group gets a third)
  message: 1, // wrote to them (same split for groups)
  search: 0.8,
  tag_open: 1,
  topic_open: 0.5, // picked a topic chip on Explore
}

/**
 * How much a look at a post counts, by time on screen: every doubling past 2.5 s adds 0.5.
 * 1 s (a scroll-past) = -0.2, 2.5 s = 0, 5 s = 0.5, 10 s or more = 0.8 (the most a look can count).
 */
export function dwellWeight(ms: number): number {
  return Math.max(-0.2, Math.min(0.8, 0.5 * Math.log2(Math.max(1, ms) / 2500)))
}

/**
 * How much watching a reel counts. Watching to the end is a strong signal (1.5); otherwise like a
 * look, but swiping away within a second or two says "not for me" (down to -0.4).
 */
export function reelWeight(ms: number, complete: boolean): number {
  if (complete) return 1.5
  return Math.max(-0.4, Math.min(0.8, 0.5 * Math.log2(Math.max(1, ms) / 3000)))
}

// ----- counting each thing once ---------------------------------------------------------------

/**
 * Some signals can arrive twice: the server sees comments being opened and the app reports it too,
 * and people reopen the same profile again and again. Those count once per half hour.
 */
const ONCE_PER_MS = 30 * 60 * 1000
const lastCounted = worldState(() => new Map<string, number>())

/** Start over: the old world's half-hour windows go too, so the new world's first signals all count. */
export function forgetRecentSignals(): void {
  lastCounted().clear()
  bestLooks().clear()
}

function firstTimeIn(key: string, at: number, windowMs = ONCE_PER_MS): boolean {
  const counted = lastCounted()
  const previous = counted.get(key)
  if (previous !== undefined && Math.abs(at - previous) < windowMs) return false
  if (counted.size > 5000) counted.clear() // old entries are only useful for half an hour anyway
  counted.set(key, at)
  return true
}

/**
 * Looking at the same post again soon doesn't mean liking it more. Within half an hour, a post's
 * looks count as its single best look: a quick scroll-past and then a long look back counts as the
 * long look, and five long looks count as one.
 */
const bestLooks = worldState(() => new Map<string, { at: number; weight: number }>())

function lookCredit(postId: string, weight: number, at: number): { credit: number; fresh: boolean } {
  const looks = bestLooks()
  const best = looks.get(postId)
  if (!best || Math.abs(at - best.at) >= ONCE_PER_MS) {
    if (looks.size > 5000) looks.clear()
    looks.set(postId, { at, weight })
    return { credit: weight, fresh: true }
  }
  if (weight <= best.weight) return { credit: 0, fresh: false }
  looks.set(postId, { at: best.at, weight })
  return { credit: weight - best.weight, fresh: false }
}

// ----- applying weights -----------------------------------------------------------------------

/** Add a weight to an author and to topics (the main topic fully, the others a bit less). */
function apply(type: string, weight: number, at: number, target: { postId?: string | null; accountId?: string | null; topics?: string[]; ms?: number | null }): void {
  if (target.accountId) bumpScore('account', target.accountId, weight, at)
  const topics = target.topics ?? []
  topics.forEach((topic, index) => bumpScore('topic', topic, weight * (TOPIC_SHARE[index] ?? 0.4), at))
  logEvent({ type, postId: target.postId ?? null, accountId: target.accountId ?? null, topics, ms: target.ms ?? null, weight, at })
}

/** A post the user can learn from: released and not their own. */
function postTarget(postId: string | null | undefined): { postId: string; accountId: string; topics: string[] } | null {
  if (!postId) return null
  const row = q('SELECT author_id, released FROM posts WHERE id = ?').get(postId) as { author_id: string; released: number } | undefined
  if (!row || row.released !== 1 || row.author_id === 'me') return null
  return { postId, accountId: row.author_id, topics: topicsOfPostId(postId) }
}

/** An account the user can learn about: anyone but themselves. */
function accountExists(accountId: string | null | undefined): accountId is string {
  return Boolean(accountId) && accountId !== 'me' && q('SELECT 1 FROM accounts WHERE id = ?').get(accountId ?? '') !== undefined
}

/**
 * The newest of a pair of opposite events ("like"/"unlike") about one target, so that liking
 * twice counts once and an unlike only takes back a like that was really counted.
 */
function newestOf(types: string[], target: { postId?: string; accountId?: string }) {
  const found = types.map((type) => lastEvent(type, target)).filter((event) => event !== null)
  return found.sort((a, b) => b.at - a.at)[0] ?? null
}

/** Learn from a like, save, comment or share. */
function learnPostAction(type: 'like' | 'save' | 'comment' | 'share', postId: string | null | undefined, at: number): boolean {
  const target = postTarget(postId)
  if (!target) return false
  if ((type === 'like' || type === 'save') && newestOf([type, `un${type}`], target)?.type === type) return false // already counted
  if (type === 'comment' && !firstTimeIn(`comment:${target.postId}`, at, 10 * 60 * 1000)) return false
  apply(type, WEIGHTS[type], at, target)
  return true
}

/** An unlike or unsave takes back exactly what the like or save still counts for. */
function takeBack(type: 'like' | 'save', postId: string | null | undefined, at: number): boolean {
  if (!postId) return false
  const earlier = newestOf([type, `un${type}`], { postId })
  if (earlier?.type !== type) return false
  apply(`un${type}`, -earlier.weight * decayFactor(at - earlier.at), at, earlier)
  return true
}

/** Following counts once; unfollowing takes a learned follow back, or says "less of them" (-3). */
function learnFollow(type: 'follow' | 'unfollow', accountId: string | null | undefined, at: number): boolean {
  if (!accountExists(accountId)) return false
  const earlier = newestOf(['follow', 'unfollow'], { accountId })
  if (earlier?.type === type) return false
  const weight = type === 'follow' ? WEIGHTS.follow : earlier ? -earlier.weight * decayFactor(at - earlier.at) : WEIGHTS.unfollow
  apply(type, weight, at, { accountId })
  return true
}

/** A look at a post (impression), opening it, or watching a reel: counts for its author and topics. */
function learnLook(signal: Signal, at: number): boolean {
  const target = postTarget(signal.postId)
  if (!target) return false
  const ms = Math.max(0, signal.ms ?? 0)
  if (signal.type === 'open') {
    if (!firstTimeIn(`open:${target.postId}`, at)) return false
    apply('open', WEIGHTS.open, at, target)
    markSeen(target.postId, 0, false, at)
    return true
  }
  const complete = signal.type === 'reel_watch' && signal.complete === true
  const { credit, fresh } = lookCredit(target.postId, signal.type === 'reel_watch' ? reelWeight(ms, complete) : dwellWeight(ms), at)
  apply(signal.type, credit, at, { ...target, ms })
  markSeen(target.postId, ms, complete, at)
  // Exposure: how often each topic was on screen lately (once per post per half hour), so Explore
  // can offer topics the user hasn't seen much.
  if (fresh) target.topics.forEach((topic, index) => bumpScore('exposure', topic, TOPIC_SHARE[index] ?? 0.4, at))
  return true
}

/** Stories count for their author: watching a little, skipping a little less, replying a lot. */
function learnStory(signal: Signal, at: number): boolean {
  const row = signal.storyId
    ? q('SELECT author_id FROM stories WHERE id = ?').get(signal.storyId) as { author_id: string } | undefined
    : undefined
  if (!row || row.author_id === 'me') return false
  const type = signal.type as 'story_view' | 'story_skip' | 'story_reply'
  apply(type, WEIGHTS[type], at, { accountId: row.author_id, ms: signal.ms ?? null })
  return true
}

/** Opening a chat or writing in it counts for its members (a third each in a group). */
function learnChat(signal: Signal, at: number): boolean {
  const row = signal.conversationId
    ? q('SELECT kind, members FROM conversations WHERE id = ?').get(signal.conversationId) as { kind: string; members: string } | undefined
    : undefined
  if (!row) return false
  const type = signal.type as 'dm_open' | 'message'
  // One message per chat every 10 minutes is enough to say "they talk a lot".
  if (!firstTimeIn(`${type}:${signal.conversationId}`, at, type === 'message' ? 10 * 60 * 1000 : ONCE_PER_MS)) return false
  const share = row.kind === 'group' ? 1 / 3 : 1
  for (const accountId of parseJson<string[]>(row.members, [])) {
    if (accountExists(accountId)) apply(type, WEIGHTS[type] * share, at, { accountId })
  }
  return true
}

/** Searches, hashtag pages and Explore topic chips count for the topics they name. */
function learnTopicSignal(signal: Signal, at: number): boolean {
  const words = (signal.type === 'search' ? signal.query : signal.tag)?.trim().toLowerCase().replace(/^#/, '') ?? ''
  if (words.length < 2) return false
  const topics = topicsOfInterest(words)
  if (topics.length === 0 || !firstTimeIn(`${signal.type}:${words}`, at)) return false
  const type = signal.type as 'search' | 'tag_open' | 'topic_open'
  apply(type, WEIGHTS[type], at, { topics })
  return true
}

// ----- the entry point ------------------------------------------------------------------------

/** Clients send their own clock times: keep them within the last day and never in the future. */
function clampTime(at: number, now: number): number {
  return Number.isFinite(at) ? Math.min(now, Math.max(now - 24 * 60 * 60 * 1000, at)) : now
}

/** Learn from one signal. Returns true when it counted (unknown posts, repeats and the like don't). */
export function learn(signal: Signal, now = Date.now()): boolean {
  const at = clampTime(signal.at, now)
  switch (signal.type) {
    case 'impression':
    case 'open':
    case 'reel_watch':
      return learnLook(signal, at)
    case 'like':
    case 'save':
    case 'comment':
    case 'share':
      return learnPostAction(signal.type, signal.postId, at)
    case 'unlike':
      return takeBack('like', signal.postId, at)
    case 'unsave':
      return takeBack('save', signal.postId, at)
    case 'follow':
    case 'unfollow':
      return learnFollow(signal.type, signal.accountId, at)
    case 'profile_view':
      if (!accountExists(signal.accountId) || !firstTimeIn(`profile:${signal.accountId}`, at)) return false
      apply('profile_view', WEIGHTS.profile_view, at, { accountId: signal.accountId })
      return true
    case 'story_view':
    case 'story_skip':
    case 'story_reply':
      return learnStory(signal, at)
    case 'dm_open':
    case 'message':
      return learnChat(signal, at)
    case 'search':
    case 'tag_open':
    case 'topic_open':
      return learnTopicSignal(signal, at)
  }
}

/** Learn from a batch in one transaction (fast, and all-or-nothing), then trim the log. Returns how many counted. */
export function learnBatch(signals: Signal[], now = Date.now()): number {
  const counted = tx(() => signals.filter((signal) => learn(signal, now)).length)
  pruneEvents()
  return counted
}
