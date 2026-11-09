/**
 * Lists of posts: the home feed, explore and reels (ranked for each user by the recommendation
 * algorithm in server/recs), hashtag pages, saved posts, profile grids and hashtag search.
 */
import type { Page, Post } from '../../shared/types.ts'
import { q } from '../db/index.ts'
import { rankedExplore, rankedFeed, rankedReels } from '../recs/index.ts'
import { toPosts } from './dto.ts'
import { pageRows, readTimeCursor } from './paging.ts'
import type { PostRow } from './rows.ts'
import { escapeRegex, hashtagsIn, likeEscape } from './text.ts'

const GRID_PAGE = 18
const TAG_PAGE = 24

/** "Older than the cursor" for lists sorted by (created_at DESC, id DESC). Takes t, t, id. */
const OLDER = '(p.created_at < ? OR (p.created_at = ? AND p.id < ?))'

// ----- ranked lists ---------------------------------------------------------------------------

/**
 * Home feed, 10 per page: my new posts first, then posts from people I follow ranked by what I
 * like, with a suggested post (and the reason for it) after every 4. See server/recs/rank.ts.
 */
export function getFeed(cursor: string | null): Page<Post> {
  return rankedFeed(cursor)
}

/** Explore, 24 per page: ranked by predicted interest with ~20% discovery; `topic` keeps posts about one interest. */
export function getExplore(cursor: string | null, topic: string | null): Page<Post> {
  return rankedExplore(cursor, topic)
}

/** Reels, 8 per page, ranked by what I watch; `start` puts that reel first. */
export function getReels(cursor: string | null, start: string | null): Page<Post> {
  return rankedReels(cursor, start)
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
