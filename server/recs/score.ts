/**
 * Scoring: a number for "how much will this user enjoy this post?", one formula per surface.
 *
 * Every formula adds up the same few ingredients, each between about -1 and 1, times a weight:
 *   author     how much the user likes the person who posted it
 *   topic      how much the user likes what it is about (#coffee, #travel...)
 *   popular    how many people engaged with it
 *   fresh      how new it is
 *   novel      a small bonus for topics the user hasn't seen much (so feeds never shrink to one topic)
 *   seen       a penalty for posts already on their screen before
 *   jitter     a tiny shuffle that changes per scroll session, so equal posts don't always tie the same way
 * The weights differ per surface: the home feed cares most about freshness and friends, Explore
 * about topics, Reels about what the user watches to the end.
 *
 * These are pure functions (no database), so tests can check the math directly.
 */
import { stableFraction } from '../repo/random.ts'
import type { Candidate } from './catalog.ts'
import type { ScoreKind, Seen } from './store.ts'

/** Everything we know about what the user likes right now. */
export interface Taste {
  /** Topic scores: learned (decayed) plus the interests picked at sign-up. */
  topics: Map<string, number>
  /** Learned account scores (decayed). */
  accounts: Map<string, number>
  /** How often each topic was on screen lately (decayed). */
  exposure: Map<string, number>
  /** Posts already seen. */
  seen: Map<string, Seen>
}

/** Interests picked at sign-up count like one like each, and never fade. */
export const INTEREST_PRIOR = 2
/** A post's main topic counts fully, its second and third topics less. */
export const TOPIC_SHARE = [1, 0.6, 0.4]

export function buildTaste(scores: Record<ScoreKind, Map<string, number>>, seen: Map<string, Seen>, interestTopics: string[]): Taste {
  const topics = new Map(scores.topic)
  for (const topic of new Set(interestTopics)) topics.set(topic, (topics.get(topic) ?? 0) + INTEREST_PRIOR)
  return { topics, accounts: scores.account, exposure: scores.exposure, seen }
}

/**
 * The score at which a preference is halfway to the most it can be. Preference = score / (score + 6):
 * 0 with no score, 0.25 for one like (or an interest picked at sign-up), 0.5 for three likes,
 * 0.8 for twelve. Each extra like helps a bit less, so a few likes on one topic tilt the feed
 * toward it without taking it over. Negative scores (skips, unfollows) go down to -0.5.
 */
const HALFWAY = 6

export function preference(score: number): number {
  return Math.max(-0.5, score / (Math.abs(score) + HALFWAY))
}

// ----- the ingredients ------------------------------------------------------------------------

/** -0.5..1: how much the user likes a topic (negative = they skip it). */
export function topicPreference(taste: Taste, topic: string): number {
  return preference(taste.topics.get(topic) ?? 0)
}

/** How much the user likes what a post is about: its best topic, where the main topic counts most. */
export function topicMatch(taste: Taste, topics: string[]): number {
  if (topics.length === 0) return 0
  return Math.max(...topics.map((topic, index) => topicPreference(taste, topic) * TOPIC_SHARE[index]))
}

/** The topic behind topicMatch, for "Because you like #coffee". */
export function bestTopic(taste: Taste, topics: string[]): string | null {
  let best: string | null = null
  let bestValue = 0
  topics.forEach((topic, index) => {
    const value = topicPreference(taste, topic) * TOPIC_SHARE[index]
    if (value > bestValue) {
      best = topic
      bestValue = value
    }
  })
  return best
}

/**
 * -0.5..1: how much the user likes an account. What we learned from their actions, plus a head
 * start from the relationship: closeness (a bestie is 0.9) and whether they follow them.
 */
export function authorPreference(taste: Taste, author: { id: string; closeness: number; followed: boolean }): number {
  const prior = 3 * author.closeness + (author.followed ? 1 : 0) // a followed bestie starts at 3.7 (0.38)
  return preference((taste.accounts.get(author.id) ?? 0) + prior)
}

/** 0..1 on a log scale: 100 interactions = 0.4, 1,000 = 0.6, 100,000+ = 1. Reel views count a tenth. */
export function popularity(post: Pick<Candidate, 'likes' | 'comments' | 'shares' | 'views'>): number {
  const interactions = post.likes + 3 * post.comments + 5 * post.shares + post.views / 10
  return Math.min(1, Math.log10(1 + interactions) / 5)
}

/** 1 for a brand-new post, 0.5 after one half-life, 0.25 after two... */
export function freshness(ageHours: number, halfLifeHours: number): number {
  return 0.5 ** (Math.max(0, ageHours) / halfLifeHours)
}

/** 0..1: how new the post's main topic is to the user (1 = hardly seen lately, 0.5 = seen ~5 times). */
export function novelty(taste: Taste, topics: string[]): number {
  if (topics.length === 0) return 0.5
  return 1 / (1 + (taste.exposure.get(topics[0]) ?? 0) / 5)
}

/**
 * 0..1: how "already seen" a post is: 0 never, 0.5 once, 0.75 twice. Liked or saved posts were seen
 * even if no app reported it, and the user's own posts count as seen twice.
 * For reels, watching to the end counts as two more views.
 */
export function seenPenalty(taste: Taste, post: Pick<Candidate, 'id' | 'likedByMe' | 'savedByMe' | 'mine'>, reel = false): number {
  const seen = taste.seen.get(post.id)
  let views = (seen?.views ?? 0) + (reel ? 2 * (seen?.completes ?? 0) : 0)
  if (post.likedByMe || post.savedByMe) views = Math.max(views, 1)
  if (post.mine) views = Math.max(views, 2)
  return 1 - 0.5 ** views
}

/** -0.5..0.5, the same for a post all through one scroll session, different in the next. */
export function jitter(postId: string, seed: string): number {
  return stableFraction(`${seed}:${postId}`) - 0.5
}

// ----- one formula per surface ----------------------------------------------------------------

/** A score and the ingredients it was made of (the biggest one explains why a post was picked). */
export interface Scored {
  post: Candidate
  score: number
  parts: Record<string, number>
}

function scored(post: Candidate, parts: Record<string, number>): Scored {
  return { post, parts, score: Object.values(parts).reduce((sum, part) => sum + part, 0) }
}

/** Home feed, posts from people the user follows: new posts from close friends first. */
export function feedScore(taste: Taste, post: Candidate, seed: string): Scored {
  return scored(post, {
    fresh: 3.0 * freshness(post.ageHours, 24), // a day old counts half as fresh
    author: 2.0 * authorPreference(taste, { id: post.authorId, closeness: post.closeness, followed: post.followed }),
    topic: 1.2 * topicMatch(taste, post.topics),
    popular: 0.8 * popularity(post),
    novel: 0.4 * novelty(taste, post.topics),
    seen: -3.0 * seenPenalty(taste, post),
    jitter: 0.3 * jitter(post.id, seed),
  })
}

/** Suggested posts in the feed (people the user doesn't follow): mostly about topics they like. */
export function suggestedScore(taste: Taste, post: Candidate, seed: string): Scored {
  return scored(post, {
    topic: 2.5 * topicMatch(taste, post.topics),
    author: 1.0 * authorPreference(taste, { id: post.authorId, closeness: post.closeness, followed: false }),
    popular: 1.2 * popularity(post),
    fresh: 1.0 * freshness(post.ageHours, 72),
    novel: 0.6 * novelty(taste, post.topics),
    seen: -3.0 * seenPenalty(taste, post),
    jitter: 0.3 * jitter(post.id, seed),
  })
}

/** Explore "For you": what the user is most likely to tap, from everyone. */
export function exploreScore(taste: Taste, post: Candidate, seed: string): Scored {
  return scored(post, {
    topic: 2.5 * topicMatch(taste, post.topics),
    author: 1.0 * authorPreference(taste, { id: post.authorId, closeness: post.closeness, followed: post.followed }),
    popular: 1.2 * popularity(post),
    fresh: 0.8 * freshness(post.ageHours, 168), // a week old counts half
    seen: -2.5 * seenPenalty(taste, post),
    jitter: 0.3 * jitter(post.id, seed),
  })
}

/**
 * Discovery picks (about 1 in 5 Explore tiles and reels): popular posts about topics the user
 * hasn't seen much yet. Topics they skip are left out; their favorites don't need the help.
 */
export function discoveryScore(taste: Taste, post: Candidate, seed: string): Scored {
  return scored(post, {
    novel: 2.0 * novelty(taste, post.topics),
    popular: 1.2 * popularity(post),
    fresh: 0.5 * freshness(post.ageHours, 168),
    seen: -2.5 * seenPenalty(taste, post, post.kind === 'reel'),
    jitter: 0.5 * jitter(post.id, seed),
  })
}

/** Can this post be a discovery pick? Not about a favorite topic, and not about one the user skips. */
export function isDiscovery(taste: Taste, post: Candidate): boolean {
  const main = post.topics[0]
  return main !== undefined && topicPreference(taste, main) >= 0 && topicMatch(taste, post.topics) < 0.5
}

/** Reels: topics and people the user watches to the end, and reels they haven't watched yet. */
export function reelScore(taste: Taste, post: Candidate, seed: string): Scored {
  return scored(post, {
    topic: 2.5 * topicMatch(taste, post.topics),
    author: 1.2 * authorPreference(taste, { id: post.authorId, closeness: post.closeness, followed: post.followed }),
    popular: 1.0 * popularity(post),
    fresh: 0.8 * freshness(post.ageHours, 120),
    novel: 0.5 * novelty(taste, post.topics),
    seen: -4.0 * seenPenalty(taste, post, true),
    jitter: 0.3 * jitter(post.id, seed),
  })
}

// ----- picking in order, with variety ---------------------------------------------------------

/** What a list has shown so far: its last few picks, and how often each author and main topic came up. */
export interface History {
  recent: Pick<Candidate, 'authorId' | 'topics'>[]
  authorCounts: Map<string, number>
  topicCounts: Map<string, number>
}

export const emptyHistory = (): History => ({ recent: [], authorCounts: new Map(), topicCounts: new Map() })

/**
 * What repeating costs, so no list has long runs of one person or one topic:
 * - the same author as the post just before: 100, so it only happens when nobody else is left
 * - the same author anywhere in the last 3: 1.0
 * - every earlier post by the author in this scroll session: 0.4 (at most 2), so even a favorite
 *   creator shows up a few times, not on every other tile
 * - each of the last 3 posts that is also about this post's main topic: 0.4
 * - every earlier post with the same main topic in this session: 0.15 (at most 1.5), so a favorite
 *   topic can't fill a whole scroll
 */
function repeatPenalty(post: Pick<Candidate, 'authorId' | 'topics'>, history: History): number {
  const last = history.recent.slice(-3)
  let penalty = 0
  if (history.recent.at(-1)?.authorId === post.authorId) penalty += 100
  if (last.some((item) => item.authorId === post.authorId)) penalty += 1.0
  penalty += Math.min(2, 0.4 * (history.authorCounts.get(post.authorId) ?? 0))
  const main = post.topics[0]
  if (main) {
    penalty += 0.4 * last.filter((item) => item.topics.includes(main)).length
    penalty += Math.min(1.5, 0.15 * (history.topicCounts.get(main) ?? 0))
  }
  return penalty
}

/**
 * Take the best item from `pool` once the repeat penalty is applied, remove it from the pool and
 * add it to the history. Returns null when the pool is empty.
 */
export function takeBest(pool: Scored[], history: History): Scored | null {
  let bestIndex = -1
  let bestValue = -Infinity
  pool.forEach((item, index) => {
    const value = item.score - repeatPenalty(item.post, history)
    if (value > bestValue) {
      bestValue = value
      bestIndex = index
    }
  })
  if (bestIndex < 0) return null
  const [best] = pool.splice(bestIndex, 1)
  history.recent.push({ authorId: best.post.authorId, topics: best.post.topics })
  if (history.recent.length > 6) history.recent.shift()
  history.authorCounts.set(best.post.authorId, (history.authorCounts.get(best.post.authorId) ?? 0) + 1)
  const main = best.post.topics[0]
  if (main) history.topicCounts.set(main, (history.topicCounts.get(main) ?? 0) + 1)
  return best
}
