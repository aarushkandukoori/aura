/**
 * server/recs - the recommendation algorithm: it learns what each user likes and ranks the feed,
 * Explore, Reels and "Suggested for you" around it. Every world learns on its own.
 *
 *   topics.ts    what a post is about: 33 topics from keyword rules (+ content/topics.json)
 *   decay.ts     scores that halve every 3 days, so recent taste counts most
 *   store.ts     the three tables: events, scores, seen posts
 *   learn.ts     signal -> score changes (a like counts 2, a share 4, a quick scroll-past -0.2...)
 *   catalog.ts   every post as a scoring candidate, with its topics cached
 *   score.ts     the scoring formulas, one per surface, plus variety (no long runs) - pure math
 *   sessions.ts  stable paging: a scroll session never serves a post twice
 *   rank.ts      the ranked feed, Explore and Reels pages
 *   people.ts    accounts to follow
 *   adapt.ts     the living world leans toward the user (which library post goes up next, prompts)
 */
import { forgetRecentSignals } from './learn.ts'
import { forgetSessions } from './sessions.ts'

export { pickLibraryPost, pickLibraryStory, recentInterests } from './adapt.ts'
export { learnBatch, type Signal } from './learn.ts'
export { recommendAccounts } from './people.ts'
export { rankedExplore, rankedFeed, rankedReels } from './rank.ts'
export { topicLabel, topicsOfInterest } from './topics.ts'

/** Start over: forget what this world kept in memory (repeat windows, scroll sessions). The tables are wiped with the world. */
export function forgetWorldMemory(): void {
  forgetRecentSignals()
  forgetSessions()
}
