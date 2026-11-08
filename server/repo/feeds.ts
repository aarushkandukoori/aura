/**
 * Lists of posts: the home feed (with suggested posts mixed in), explore, reels, hashtag pages,
 * saved posts, profile grids and hashtag search.
 */
import type { Page, Post } from '../../shared/types.ts'
import { getSetting, parseJson, q } from '../db/index.ts'
import { toPosts } from './dto.ts'
import { interestScore, matchesInterest } from './interests.ts'
import {
  decodeCursor, encodeCursor, FROM_TOP, isTimeCursor, offsetCursor, pageRows, readOffset, readTimeCursor, type TimeCursor,
} from './paging.ts'
import { getVisiblePostRow } from './posts.ts'
import { stableFraction } from './random.ts'
import type { PostRow } from './rows.ts'
import { escapeRegex, hashtagsIn, likeEscape } from './text.ts'

const FEED_PAGE = 10
const SUGGEST_EVERY = 6
const EXPLORE_PAGE = 24
/** A topic page needs this many posts that are really about the topic before it stops borrowing others. */
const MIN_TOPIC_POSTS = 12
const REELS_PAGE = 8
const GRID_PAGE = 18
const TAG_PAGE = 24
const DAY_MS = 24 * 60 * 60 * 1000

/** "Older than the cursor" for lists sorted by (created_at DESC, id DESC). Takes t, t, id. */
const OLDER = '(p.created_at < ? OR (p.created_at = ? AND p.id < ?))'

const keyOf = (row: PostRow): TimeCursor => ({ t: row.created_at, id: row.id })

// ----- home feed ------------------------------------------------------------------------------

interface FeedCursor {
  followed: TimeCursor      // last followed post shown
  suggested: TimeCursor     // last suggested post shown
  sinceSuggestion: number   // followed posts shown since the last suggested one
  followedDone: boolean     // no followed posts left
}

function followedPosts(from: TimeCursor, limit: number): PostRow[] {
  return q(`
    SELECT p.* FROM posts p JOIN accounts a ON a.id = p.author_id
    WHERE p.released = 1 AND (a.id = 'me' OR a.i_follow = 1) AND ${OLDER}
    ORDER BY p.created_at DESC, p.id DESC LIMIT ?`).all(from.t, from.t, from.id, limit) as PostRow[]
}

function suggestedPosts(from: TimeCursor, limit: number): PostRow[] {
  return q(`
    SELECT p.* FROM posts p JOIN accounts a ON a.id = p.author_id
    WHERE p.released = 1 AND a.kind = 'cast' AND a.i_follow = 0 AND a.role IN ('creator', 'mutual') AND ${OLDER}
    ORDER BY p.created_at DESC, p.id DESC LIMIT ?`).all(from.t, from.t, from.id, limit) as PostRow[]
}

/**
 * Home feed: my posts and posts from accounts I follow, newest first, 10 per page. After every 6
 * of those comes one suggested post (a creator or mutual I don't follow); once the followed posts
 * run out it keeps going with suggested posts until those run out too.
 */
export function getFeed(cursor: string | null): Page<Post> {
  // Each field is checked: a hand-made cursor must not reach SQL (or crash it).
  const saved = decodeCursor<Record<string, unknown>>(cursor) ?? {}
  const state: FeedCursor = {
    followed: isTimeCursor(saved.followed) ? saved.followed : FROM_TOP,
    suggested: isTimeCursor(saved.suggested) ? saved.suggested : FROM_TOP,
    sinceSuggestion: typeof saved.sinceSuggestion === 'number' ? saved.sinceSuggestion : 0,
    followedDone: saved.followedDone === true,
  }
  // One row more than a page from each list tells us whether anything is left afterwards.
  const followed = state.followedDone ? [] : followedPosts(state.followed, FEED_PAGE + 1)
  const suggested = suggestedPosts(state.suggested, FEED_PAGE + 1)

  const page: PostRow[] = []
  const suggestedIds = new Set<string>()
  let f = 0
  let s = 0
  while (page.length < FEED_PAGE) {
    const followedLeft = f < followed.length
    const suggestionTurn = state.sinceSuggestion >= SUGGEST_EVERY || !followedLeft
    if (suggestionTurn && s < suggested.length) {
      const row = suggested[s++]
      page.push(row)
      suggestedIds.add(row.id)
      state.suggested = keyOf(row)
      state.sinceSuggestion = 0
    } else if (followedLeft) {
      const row = followed[f++]
      page.push(row)
      state.followed = keyOf(row)
      state.sinceSuggestion++
    } else {
      break
    }
  }
  // We fetch 11 but show at most 10, so using up every fetched row means the list is finished.
  state.followedDone = f >= followed.length
  const more = f < followed.length || s < suggested.length
  return { items: toPosts(page, suggestedIds), nextCursor: more ? encodeCursor(state) : null }
}

// ----- explore --------------------------------------------------------------------------------

/**
 * Explore: released posts by everyone but me, ranked by likes, freshness and how well they match
 * my interests, plus a little stable jitter so the grid doesn't look sorted. Each extra post by
 * the same author ranks a bit lower, so one account can't fill the grid. `topic` keeps only posts
 * about that interest. 24 per page.
 */
export function getExplore(cursor: string | null, topic: string | null): Page<Post> {
  const interests = getSetting<string[]>('interests', [])
  const rows = q(`
    SELECT p.*, a.persona AS author_persona FROM posts p JOIN accounts a ON a.id = p.author_id
    WHERE p.released = 1 AND p.author_id != 'me'`).all() as (PostRow & { author_persona: string | null })[]
  const time = Date.now()

  const described = rows.map((row) => {
    const persona = parseJson<{ interests?: string[]; look?: string }>(row.author_persona, {})
    // What the post itself is about: its caption, plus what the picture shows. Picture notes
    // start with the author's usual look (clothes, hair), which says nothing about this post.
    const own = `${row.caption} ${(row.ai_note ?? '').replaceAll(persona.look ?? '', '')}`
    return { row, own, about: `${(persona.interests ?? []).join(', ')} ${own}` }
  })
  // A topic page shows posts about the topic. Posts by people who are merely into it (a foodie's
  // hiking photo) only fill in when there are too few of those.
  const aboutTopic = topic ? described.filter(({ own }) => matchesInterest(topic, own)) : described
  const pool = !topic || aboutTopic.length >= MIN_TOPIC_POSTS
    ? aboutTopic
    : described.filter(({ about }) => matchesInterest(topic, about))

  const scored = pool
    .map(({ row, own, about }) => {
      const ageDays = (time - row.created_at) / DAY_MS
      const popularity = Math.log10(row.like_count + 10)
      const freshness = 3 * Math.exp(-ageDays / 7)
      const relevance = Math.min(2, interestScore(interests, about))
      // On a topic page, posts that are about the topic come before posts by people who just like it.
      const onTopic = topic && matchesInterest(topic, own) ? 3 : 0
      const jitter = stableFraction(row.id) // breaks near-ties the same way every time
      return { row, score: popularity + freshness + relevance + onTopic + jitter }
    })
    .sort((a, b) => b.score - a.score)

  // An author's 2nd best post loses 1.5 points, the 3rd loses 3, and so on.
  const postsSoFar = new Map<string, number>()
  const ranked = scored
    .map(({ row, score }) => {
      const earlier = postsSoFar.get(row.author_id) ?? 0
      postsSoFar.set(row.author_id, earlier + 1)
      return { row, score: score - 1.5 * earlier }
    })
    .sort((a, b) => b.score - a.score)

  const offset = readOffset(cursor)
  const page = ranked.slice(offset, offset + EXPLORE_PAGE).map((item) => item.row)
  return { items: toPosts(page), nextCursor: offsetCursor(offset + EXPLORE_PAGE, ranked.length) }
}

// ----- reels ----------------------------------------------------------------------------------

/** Reels (cast and mine), newest first, 8 per page. `start` puts that reel first. */
export function getReels(cursor: string | null, start: string | null): Page<Post> {
  const saved = decodeCursor<{ start?: unknown }>(cursor)
  const startId = saved ? (typeof saved.start === 'string' ? saved.start : null) : start
  const from = readTimeCursor(cursor)
  const rows = q(`
    SELECT p.* FROM posts p WHERE p.released = 1 AND p.kind = 'reel' AND p.id != ? AND ${OLDER}
    ORDER BY p.created_at DESC, p.id DESC LIMIT ?`).all(startId ?? '', from.t, from.t, from.id, REELS_PAGE + 1) as PostRow[]
  const page = pageRows(rows, REELS_PAGE)

  let items = page.rows
  if (!saved && startId) {
    const first = getVisiblePostRow(startId)
    if (first?.kind === 'reel') items = [first, ...items]
  }
  const last = page.rows.at(-1)
  const nextCursor = page.nextCursor && last ? encodeCursor({ ...keyOf(last), start: startId }) : null
  return { items: toPosts(items), nextCursor }
}

// ----- hashtags, saved, profile grids ---------------------------------------------------------

/** Posts whose caption contains #tag (any letter case), newest first, 24 per page. */
export function getTagPosts(tag: string, cursor: string | null): Page<Post> {
  const clean = tag.trim().replace(/^#/, '').toLowerCase()
  if (!clean) return { items: [], nextCursor: null }
  // LIKE narrows it down fast; the regex makes sure "#art" doesn't match "#artist".
  const exact = new RegExp(`#${escapeRegex(clean)}(?![\\p{L}\\p{N}_])`, 'iu')
  const from = readTimeCursor(cursor)
  const candidates = q(`
    SELECT p.* FROM posts p WHERE p.released = 1 AND p.caption LIKE ? ESCAPE '\\' AND ${OLDER}
    ORDER BY p.created_at DESC, p.id DESC`).all(`%#${likeEscape(clean)}%`, from.t, from.t, from.id) as PostRow[]
  const page = pageRows(candidates.filter((row) => exact.test(row.caption)), TAG_PAGE)
  return { items: toPosts(page.rows), nextCursor: page.nextCursor }
}

/** Posts I saved, newest first. */
export function getSaved(cursor: string | null): Page<Post> {
  const from = readTimeCursor(cursor)
  const rows = q(`
    SELECT p.* FROM posts p WHERE p.released = 1 AND p.saved_by_me = 1 AND ${OLDER}
    ORDER BY p.created_at DESC, p.id DESC LIMIT ?`).all(from.t, from.t, from.id, GRID_PAGE + 1) as PostRow[]
  const page = pageRows(rows, GRID_PAGE)
  return { items: toPosts(page.rows), nextCursor: page.nextCursor }
}

export type ProfileTab = 'posts' | 'reels' | 'tagged'

const TAB_FILTERS: Record<ProfileTab, string> = {
  posts: 'p.author_id = ?',
  reels: "p.author_id = ? AND p.kind = 'reel'",
  tagged: 'EXISTS (SELECT 1 FROM json_each(p.tagged) WHERE value = ?)',
}

/** A profile grid: everything they posted, their reels, or posts they're tagged in. 18 per page. */
export function getProfilePosts(accountId: string, tab: ProfileTab, cursor: string | null): Page<Post> {
  const from = readTimeCursor(cursor)
  const rows = q(`
    SELECT p.* FROM posts p WHERE p.released = 1 AND ${TAB_FILTERS[tab]} AND ${OLDER}
    ORDER BY p.created_at DESC, p.id DESC LIMIT ?`).all(accountId, from.t, from.t, from.id, GRID_PAGE + 1) as PostRow[]
  const page = pageRows(rows, GRID_PAGE)
  return { items: toPosts(page.rows), nextCursor: page.nextCursor }
}

/** Hashtags used in released captions that start with the query, most used first. */
export function searchTags(query: string, limit = 10): { tag: string; postCount: number }[] {
  const start = query.trim().replace(/^#/, '').toLowerCase()
  if (!start) return []
  const rows = q("SELECT caption FROM posts WHERE released = 1 AND caption LIKE ? ESCAPE '\\'")
    .all(`%#${likeEscape(start)}%`) as { caption: string }[]
  const counts = new Map<string, number>()
  for (const { caption } of rows) {
    for (const tag of new Set(hashtagsIn(caption))) {
      if (tag.startsWith(start)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts]
    .map(([tag, postCount]) => ({ tag, postCount }))
    .sort((a, b) => b.postCount - a.postCount || a.tag.localeCompare(b.tag))
    .slice(0, limit)
}
