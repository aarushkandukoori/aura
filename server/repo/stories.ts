/**
 * Stories: the tray on the home screen, viewing and posting, and the world actions the simulation
 * uses (characters posting stories, viewing and reacting to mine).
 */
import type { Media, Story, StoryOverlay, StoryTray, ViewersResponse } from '../../shared/types.ts'
import { STORY_LIFETIME_MS } from '../config.ts'
import { newId, now, parseJson, q, tx } from '../db/index.ts'
import { broadcast } from '../live.ts'
import { broadcastAccount, getAccountByUsername, getAccountRow, toAccounts, touchActive } from './accounts.ts'
import { toStories } from './dto.ts'
import { pushNotification } from './notifications.ts'
import { jsonList, type AccountRow, type StoryRow } from './rows.ts'

export function getStoryRow(id: string): StoryRow | undefined {
  return q('SELECT * FROM stories WHERE id = ?').get(id) as StoryRow | undefined
}

/** Group stories (already oldest first) into one tray per author. */
function toTrays(stories: Story[]): StoryTray[] {
  const trays = new Map<string, StoryTray>()
  for (const story of stories) {
    const tray = trays.get(story.author.id)
    if (tray) {
      tray.stories.push(story)
      tray.allSeen = tray.allSeen && story.seen
      tray.latestAt = Math.max(tray.latestAt, story.createdAt)
    } else {
      trays.set(story.author.id, { author: story.author, stories: [story], allSeen: story.seen, latestAt: story.createdAt })
    }
  }
  return [...trays.values()]
}

/** The home tray: mine first (if I have stories up), then unseen trays newest first, then seen ones. */
export function getStoryTrays(): StoryTray[] {
  const rows = q(`
    SELECT s.* FROM stories s JOIN accounts a ON a.id = s.author_id
    WHERE s.released = 1 AND s.expires_at > ? AND (a.id = 'me' OR a.i_follow = 1)
    ORDER BY s.created_at, s.rowid`).all(now()) as StoryRow[]
  const rank = (tray: StoryTray) => (tray.author.kind === 'me' ? 0 : tray.allSeen ? 2 : 1)
  return toTrays(toStories(rows)).sort((a, b) => rank(a) - rank(b) || b.latestAt - a.latestAt)
}

/** One person's current stories (followed or not). Null when they have none up. */
export function getUserTray(username: string): StoryTray | null {
  const author = getAccountByUsername(username)
  if (!author) return null
  const rows = q('SELECT * FROM stories WHERE author_id = ? AND released = 1 AND expires_at > ? ORDER BY created_at, rowid')
    .all(author.id, now()) as StoryRow[]
  return toTrays(toStories(rows))[0] ?? null
}

/** The stories in a highlight, in order (highlights ignore expiry). Null for an unknown highlight. */
export function getHighlightStories(highlightId: string): Story[] | null {
  const highlight = q('SELECT story_ids FROM highlights WHERE id = ?').get(highlightId) as { story_ids: string } | undefined
  if (!highlight) return null
  const ids = parseJson<string[]>(highlight.story_ids, [])
  const rows = q('SELECT * FROM stories WHERE id IN (SELECT value FROM json_each(?))').all(jsonList(ids)) as StoryRow[]
  const stories = new Map(toStories(rows).map((story) => [story.id, story]))
  return ids.flatMap((id) => stories.get(id) ?? [])
}

/** The user posts a story for 24 hours. Broadcasts story.new and my new story ring. */
export function createStory(media: Media, overlay: StoryOverlay | null): Story {
  const id = newId('s')
  const time = now()
  q(`INSERT INTO stories (id, author_id, media, overlay, released, seen, view_count, created_at, expires_at)
     VALUES (?, 'me', ?, ?, 1, 0, 0, ?, ?)`).run(
    id, JSON.stringify(media), overlay ? JSON.stringify(overlay) : null, time, time + STORY_LIFETIME_MS,
  )
  const story = toStories([getStoryRow(id) as StoryRow])[0]
  broadcast({ type: 'story.new', story })
  broadcastAccount('me')
  return story
}

/** I watched a story. When that finishes someone's tray, their ring turns gray in every app. */
export function markStorySeen(id: string): boolean {
  const row = getStoryRow(id)
  if (!row || row.released !== 1) return false
  if (row.seen === 0) {
    q('UPDATE stories SET seen = 1 WHERE id = ?').run(id)
    const unseen = q('SELECT COUNT(*) AS n FROM stories WHERE author_id = ? AND released = 1 AND expires_at > ? AND seen = 0')
      .get(row.author_id, now()) as { n: number }
    if (unseen.n === 0) broadcastAccount(row.author_id)
  }
  return true
}

/** Who viewed a story, newest first, with emoji reactions. Total = every view (named + crowd). */
export function getViewers(storyId: string): ViewersResponse {
  const rows = q(`
    SELECT a.*, v.reaction AS view_reaction FROM story_views v JOIN accounts a ON a.id = v.account_id
    WHERE v.story_id = ? ORDER BY v.created_at DESC`).all(storyId) as (AccountRow & { view_reaction: string | null })[]
  const accounts = toAccounts(rows) // same order as rows
  return {
    viewers: accounts.map((account, index) => ({ account, reaction: rows[index].view_reaction })),
    total: getStoryRow(storyId)?.view_count ?? 0,
  }
}

/** Delete one of my stories. Broadcasts story.deleted, and my story ring updates in every app. */
export function deleteStory(id: string): void {
  q('DELETE FROM stories WHERE id = ?').run(id)
  broadcast({ type: 'story.deleted', storyId: id, authorId: 'me' })
  broadcastAccount('me')
}

// ----- world actions (used by the simulation) -------------------------------------------------

/** A character posts a library story now, up for 24 hours. Broadcasts story.new and their ring. */
export function releaseStory(storyId: string): Story | null {
  const row = getStoryRow(storyId)
  if (!row || row.released === 1) return null
  const time = now()
  q('UPDATE stories SET released = 1, seen = 0, created_at = ?, expires_at = ? WHERE id = ?')
    .run(time, time + STORY_LIFETIME_MS, storyId)
  touchActive(row.author_id)
  const story = toStories([getStoryRow(storyId) as StoryRow])[0] ?? null
  if (story) {
    broadcast({ type: 'story.new', story })
    broadcastAccount(row.author_id)
  }
  return story
}

/** People view a story: named viewers get rows (the "Seen by" list), crowdCount only adds to the total. */
export function addStoryViews(storyId: string, namedIds: string[], crowdCount: number): void {
  const row = getStoryRow(storyId)
  if (!row) return
  const time = now()
  let added = 0
  tx(() => {
    for (const id of new Set(namedIds)) {
      if (id === row.author_id) continue
      // INSERT ... SELECT skips ids that aren't real accounts; OR IGNORE skips repeat viewers.
      const result = q('INSERT OR IGNORE INTO story_views (story_id, account_id, created_at) SELECT ?, id, ? FROM accounts WHERE id = ?')
        .run(storyId, time, id)
      added += Number(result.changes)
    }
    q('UPDATE stories SET view_count = view_count + ? WHERE id = ?').run(added + Math.max(0, Math.round(crowdCount)), storyId)
  })
  broadcast({ type: 'story.views', storyId, viewCount: (getStoryRow(storyId) as StoryRow).view_count })
}

/** Someone reacts to a story with an emoji (counts as a view). On my story: a story_reaction notification. */
export function reactToStory(storyId: string, accountId: string, emoji: string): void {
  const row = getStoryRow(storyId)
  if (!row || accountId === row.author_id || !getAccountRow(accountId)) return
  const alreadyViewed = q('SELECT 1 FROM story_views WHERE story_id = ? AND account_id = ?').get(storyId, accountId) !== undefined
  tx(() => {
    if (alreadyViewed) {
      q('UPDATE story_views SET reaction = ? WHERE story_id = ? AND account_id = ?').run(emoji, storyId, accountId)
    } else {
      q('INSERT INTO story_views (story_id, account_id, reaction, created_at) VALUES (?, ?, ?, ?)').run(storyId, accountId, emoji, now())
      q('UPDATE stories SET view_count = view_count + 1 WHERE id = ?').run(storyId)
    }
  })
  if (!alreadyViewed) broadcast({ type: 'story.views', storyId, viewCount: row.view_count + 1 })
  if (row.author_id === 'me') pushNotification({ kind: 'story_reaction', actorId: accountId, text: emoji })
}

/**
 * Put the characters' expired stories back in the library, so they can post them again another
 * day (the library is finite). Highlight copies stay put. Returns how many came back.
 */
export function recycleStories(): number {
  const result = q(`
    UPDATE stories SET released = 0
    WHERE released = 1 AND author_id != 'me' AND expires_at <= ?
      AND id NOT IN (SELECT value FROM highlights, json_each(highlights.story_ids))`).run(now())
  return Number(result.changes)
}

/** Library stories not posted yet (released = 0), in content order. Optionally for one author. */
export function getLibraryStories(authorId?: string): StoryRow[] {
  return (authorId
    ? q('SELECT * FROM stories WHERE released = 0 AND author_id = ? ORDER BY rowid').all(authorId)
    : q('SELECT * FROM stories WHERE released = 0 ORDER BY rowid').all()) as StoryRow[]
}
