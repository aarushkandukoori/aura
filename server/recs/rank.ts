/**
 * Ranked lists, a page at a time: the home feed, Explore and Reels.
 *
 * Each page: load every released post (one query), drop the ones this scroll session already
 * served, score the rest with the surface's formula (score.ts), then pick in order with
 * takeBest(), which keeps long runs of one author or topic out. Measured at a few milliseconds a
 * page for a world of ~300 posts.
 */
import type { Page, Post } from '../../shared/types.ts'
import { getSetting, q } from '../db/index.ts'
import { toPosts } from '../repo/dto.ts'
import { matchesInterest } from '../repo/interests.ts'
import { jsonList, type PostRow } from '../repo/rows.ts'
import { loadAuthors, loadCandidates, type AuthorInfo, type Candidate } from './catalog.ts'
import { HOUR_MS } from './decay.ts'
import {
  bestTopic, buildTaste, discoveryScore, exploreScore, feedScore, isDiscovery, reelScore, suggestedScore, takeBest,
  type Scored, type Taste,
} from './score.ts'
import { nextCursor, openSession, rememberPage, type ScrollSession } from './sessions.ts'
import { readScores, readSeen } from './store.ts'
import { topicsOfInterest } from './topics.ts'

const FEED_PAGE = 10
const EXPLORE_PAGE = 24
const REELS_PAGE = 8
/** After this many posts from people you follow comes one suggested post (1 in 5). */
const SUGGEST_EVERY = 4
/** Every 5th Explore tile and every 5th reel is a discovery pick: about 20% exploration. */
const DISCOVER_EVERY = 5
/** The user's own new posts stay at the top of the feed (and Reels) this long after posting. */
const PIN_OWN_MS = 3 * HOUR_MS
/** A topic page needs this many posts about the topic before it stops borrowing others. */
const MIN_TOPIC_POSTS = 12

/** What the user likes right now: learned scores, what they have seen, and their sign-up interests. */
export function currentTaste(now = Date.now()): Taste {
  const interests = getSetting<string[]>('interests', [])
  return buildTaste(readScores(now), readSeen(), interests.flatMap(topicsOfInterest))
}

// ----- turning picked ids into a page ---------------------------------------------------------

/** Post DTOs in the picked order. Suggested posts carry the reason they were picked. */
function toPage(ids: string[], next: string | null, session: ScrollSession): Page<Post> {
  if (ids.length === 0) return { items: [], nextCursor: next }
  const rows = q('SELECT * FROM posts WHERE id IN (SELECT value FROM json_each(?))').all(jsonList(ids)) as PostRow[]
  const byId = new Map(rows.map((row) => [row.id, row]))
  const suggested = new Set(ids.filter((id) => session.reasons.has(id)))
  const posts = toPosts(ids.flatMap((id) => byId.get(id) ?? []), suggested)
  return {
    items: posts.map((post) => (post.suggested ? { ...post, reason: session.reasons.get(post.id) ?? null } : post)),
    nextCursor: next,
  }
}

/** Save a freshly built page in its session and return it. */
function finishPage(session: ScrollSession, page: number, ids: string[], more: boolean): Page<Post> {
  rememberPage(session, page, ids, more)
  return toPage(ids, more ? nextCursor(session, page) : null, session)
}

/** A page this session already served (a retry) comes back exactly the same. */
function servedBefore(session: ScrollSession, page: number): Page<Post> | null {
  const saved = session.pages.get(page)
  return saved ? toPage(saved.ids, saved.more ? nextCursor(session, page) : null, session) : null
}

/** Remove a post from a pool (it was picked from another pool built from the same posts). */
function dropFrom(pool: Scored[], postId: string): void {
  const index = pool.findIndex((item) => item.post.id === postId)
  if (index >= 0) pool.splice(index, 1)
}

/** The user's own posts from the last few hours, newest first: they lead the first page. */
function pinnedOwnPosts(candidates: Candidate[], now: number): Candidate[] {
  return candidates.filter((post) => post.mine && now - post.createdAt < PIN_OWN_MS).sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Why a suggested post was picked, the most personal reason first: a topic the user likes (when it
 * added a real part of the score), an author they keep engaging with, a topic that is new to them,
 * or plain popularity.
 */
function reasonFor(item: Scored, taste: Taste): string {
  const { topic = 0, author = 0, popular = 0, novel = 0 } = item.parts
  const liked = bestTopic(taste, item.post.topics)
  const main = item.post.topics[0]
  if (liked && topic >= 0.5) return `Because you like #${liked}`
  if (author >= 0.6) return "Because you've been enjoying their posts"
  if (main && novel > popular) return `Something new for you: #${main}`
  return main ? `Popular in #${main}` : 'Popular right now'
}

// ----- home feed ------------------------------------------------------------------------------

/**
 * Home feed, 10 posts a page: the user's own fresh posts first, then posts from people they follow
 * ranked by feedScore, with the best suggested post (people they don't follow) after every 4.
 * When followed posts run out, the feed keeps going with suggested posts until those run out too.
 */
export function rankedFeed(cursor: string | null, now = Date.now()): Page<Post> {
  const { session, page } = openSession(cursor, 'feed', now)
  const again = servedBefore(session, page)
  if (again) return again

  const taste = currentTaste(now)
  const candidates = loadCandidates({ now }).filter((post) => !session.served.has(post.id))
  const pinned = page === 1 ? pinnedOwnPosts(candidates, now) : []
  const followed = candidates
    .filter((post) => (post.mine || post.followed) && !pinned.includes(post))
    .map((post) => feedScore(taste, post, session.id))
  const suggested = candidates.filter((post) => !post.mine && !post.followed).map((post) => suggestedScore(taste, post, session.id))

  const ids = pinned.slice(0, FEED_PAGE).map((post) => post.id)
  while (ids.length < FEED_PAGE) {
    const since = session.counters.sinceSuggestion ?? 0
    const useSuggestion = suggested.length > 0 && (followed.length === 0 || since >= SUGGEST_EVERY)
    const pick = takeBest(useSuggestion ? suggested : followed, session.history)
    if (!pick) break
    ids.push(pick.post.id)
    if (useSuggestion) {
      session.reasons.set(pick.post.id, reasonFor(pick, taste))
      session.counters.sinceSuggestion = 0
    } else {
      session.counters.sinceSuggestion = since + 1
    }
  }
  return finishPage(session, page, ids, followed.length + suggested.length > 0)
}

// ----- explore --------------------------------------------------------------------------------

/**
 * Posts for an Explore topic chip: about the topic (its taxonomy topics, or its words for a
 * free-form interest like "film photography"). With fewer than 12 of those, posts by people who
 * are into it fill in after them.
 */
function topicPool(candidates: Candidate[], topic: string, authors: Map<string, AuthorInfo>): { pool: Candidate[]; about: Set<string> } {
  const topics = topicsOfInterest(topic)
  const isAbout = (post: Candidate) => post.topics.some((item) => topics.includes(item)) || matchesInterest(topic, post.text)
  const about = new Set(candidates.filter(isAbout).map((post) => post.id))
  if (about.size >= MIN_TOPIC_POSTS) return { pool: candidates.filter((post) => about.has(post.id)), about }
  const intoIt = (post: Candidate) => matchesInterest(topic, (authors.get(post.authorId)?.interests ?? []).join(', '))
  return { pool: candidates.filter((post) => about.has(post.id) || intoIt(post)), about }
}

/**
 * Explore, 24 tiles a page: everyone's posts but the user's, ranked by exploreScore. "For you"
 * makes every 5th tile a discovery pick (a popular post about a topic the user hasn't seen much).
 * A topic chip shows posts about that topic, best first.
 */
export function rankedExplore(cursor: string | null, topic: string | null, now = Date.now()): Page<Post> {
  const clean = topic?.trim().toLowerCase() || null
  const { session, page } = openSession(cursor, clean ? `explore:${clean}` : 'explore', now)
  const again = servedBefore(session, page)
  if (again) return again

  const taste = currentTaste(now)
  const authors = loadAuthors()
  let candidates = loadCandidates({ now, authors }).filter((post) => !post.mine)
  let about: Set<string> | null = null
  if (clean) {
    const topical = topicPool(candidates, clean, authors)
    candidates = topical.pool
    about = topical.about
  }
  candidates = candidates.filter((post) => !session.served.has(post.id))

  const regular = candidates.map((post) => {
    const item = exploreScore(taste, post, session.id)
    // On a topic page, posts about the topic come before posts by people who are merely into it.
    if (about?.has(post.id)) item.score += 3
    return item
  })
  const discovery = clean ? [] : candidates.filter((post) => isDiscovery(taste, post)).map((post) => discoveryScore(taste, post, session.id))

  const ids: string[] = []
  while (ids.length < EXPLORE_PAGE) {
    const position = session.served.size + ids.length
    const discover = discovery.length > 0 && (position + 1) % DISCOVER_EVERY === 0
    const pick = (discover ? takeBest(discovery, session.history) : null) ?? takeBest(regular, session.history)
    if (!pick) break
    ids.push(pick.post.id)
    dropFrom(regular, pick.post.id)
    dropFrom(discovery, pick.post.id)
  }
  return finishPage(session, page, ids, regular.length > 0)
}

// ----- reels ----------------------------------------------------------------------------------

/**
 * Reels, 8 a page, ranked by reelScore (what the user watches to the end), with every 5th a
 * discovery pick. `start` (a reel opened from a grid) plays first; otherwise the user's own reel
 * from the last few hours does.
 */
export function rankedReels(cursor: string | null, start: string | null, now = Date.now()): Page<Post> {
  const { session, page } = openSession(cursor, start ? `reels:${start}` : 'reels', now)
  const again = servedBefore(session, page)
  if (again) return again

  const taste = currentTaste(now)
  const candidates = loadCandidates({ reelsOnly: true, now }).filter((post) => !session.served.has(post.id))
  const first = page === 1
    ? (start ? candidates.filter((post) => post.id === start) : pinnedOwnPosts(candidates, now)).slice(0, REELS_PAGE)
    : []
  const rest = candidates.filter((post) => !first.includes(post))
  const regular = rest.map((post) => reelScore(taste, post, session.id))
  const discovery = rest.filter((post) => isDiscovery(taste, post)).map((post) => discoveryScore(taste, post, session.id))

  const ids = first.map((post) => post.id)
  while (ids.length < REELS_PAGE) {
    const position = session.served.size + ids.length
    const discover = discovery.length > 0 && (position + 1) % DISCOVER_EVERY === 0
    const pick = (discover ? takeBest(discovery, session.history) : null) ?? takeBest(regular, session.history)
    if (!pick) break
    ids.push(pick.post.id)
    dropFrom(regular, pick.post.id)
    dropFrom(discovery, pick.post.id)
  }
  return finishPage(session, page, ids, regular.length > 0)
}
