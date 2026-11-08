/**
 * Posts: reading one post, the user's actions on posts (create, delete, like, save, view, share)
 * and the world actions the simulation uses (release a library post, add likes, describe a photo).
 */
import type { LikeResponse, LikesResponse, Media, Post, SaveResponse, ViewResponse } from '../../shared/types.ts'
import { bit, newId, now, q, tx } from '../db/index.ts'
import { broadcast } from '../live.ts'
import { getMeRow, randomCrowdIds, toAccounts, touchActive } from './accounts.ts'
import { bestLiker, toPost } from './dto.ts'
import { broadcastMeStats } from './followers.ts'
import { pushNotification, unreadGroup } from './notifications.ts'
import { randomInt, stableFraction } from './random.ts'
import type { AccountRow, PostRow } from './rows.ts'

const LIKES_LIST_SIZE = 50

export function getPostRow(id: string): PostRow | undefined {
  return q('SELECT * FROM posts WHERE id = ?').get(id) as PostRow | undefined
}

/** A post the apps may see. Library posts (released = 0) stay hidden until the sim posts them. */
export function getVisiblePostRow(id: string): PostRow | undefined {
  const row = getPostRow(id)
  return row && row.released === 1 ? row : undefined
}

export function getPost(id: string): Post | null {
  const row = getVisiblePostRow(id)
  return row ? toPost(row) : null
}

/** Send a post's latest counts and "Liked by" account to every open app. */
export function broadcastPostStats(postId: string): void {
  const row = getVisiblePostRow(postId)
  if (!row) return
  broadcast({
    type: 'post.stats',
    postId,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    viewCount: row.view_count,
    shareCount: row.share_count,
    likedBy: bestLiker(postId),
  })
}

// ----- the user's own actions -----------------------------------------------------------------

export interface NewPost {
  kind: 'photo' | 'carousel' | 'reel'
  media: Media[]
  caption: string
  location: string | null
  taggedIds: string[]
}

/** The user publishes a post. Broadcasts post.new and me.stats and returns the post. */
export function createPost(input: NewPost): Post {
  const id = newId('p')
  const audio = input.kind === 'reel' ? `original audio · ${getMeRow()?.username ?? 'you'}` : null
  q(`INSERT INTO posts (id, author_id, kind, media, caption, location, tagged, audio, released, created_at)
     VALUES (?, 'me', ?, ?, ?, ?, ?, ?, 1, ?)`).run(
    id, input.kind, JSON.stringify(input.media), input.caption, input.location, JSON.stringify(input.taggedIds), audio, now(),
  )
  const post = getPost(id) as Post // just inserted, so it exists
  broadcast({ type: 'post.new', post })
  broadcastMeStats()
  return post
}

/** Delete a post (its likes, comments and notifications go with it). Broadcasts post.deleted. */
export function deletePost(id: string): void {
  q('DELETE FROM posts WHERE id = ?').run(id)
  broadcast({ type: 'post.deleted', postId: id })
  broadcastMeStats()
}

/** The user likes or unlikes a post. Null if the post can't be seen. */
export function setPostLike(id: string, liked: boolean): LikeResponse | null {
  const row = getVisiblePostRow(id)
  if (!row) return null
  if ((row.liked_by_me === 1) !== liked) {
    tx(() => {
      q('UPDATE posts SET liked_by_me = ?, like_count = MAX(0, like_count + ?) WHERE id = ?').run(bit(liked), liked ? 1 : -1, id)
      if (liked) q("INSERT OR IGNORE INTO post_likes (post_id, account_id, created_at) VALUES (?, 'me', ?)").run(id, now())
      else q("DELETE FROM post_likes WHERE post_id = ? AND account_id = 'me'").run(id)
    })
    broadcastPostStats(id)
  }
  const fresh = getPostRow(id) as PostRow
  return { likeCount: fresh.like_count, likedByMe: fresh.liked_by_me === 1 }
}

export function setPostSave(id: string, saved: boolean): SaveResponse | null {
  if (!getVisiblePostRow(id)) return null
  q('UPDATE posts SET saved_by_me = ? WHERE id = ?').run(bit(saved), id)
  return { savedByMe: saved }
}

/** Someone (the user) watched a reel. Cast reels also pick up a few views from strangers. */
export function addPostView(id: string): ViewResponse | null {
  const row = getVisiblePostRow(id)
  if (!row) return null
  const views = 1 + (row.kind === 'reel' && row.author_id !== 'me' ? randomInt(0, 3) : 0)
  q('UPDATE posts SET view_count = view_count + ? WHERE id = ?').run(views, id)
  broadcastPostStats(id)
  return { viewCount: row.view_count + views }
}

/** Count one share of a post (the messages themselves are sent by sendMyMessage). */
export function countShare(id: string): void {
  q('UPDATE posts SET share_count = share_count + 1 WHERE id = ?').run(id)
  broadcastPostStats(id)
}

/**
 * "Liked by" list: named likers first (me, then cast by closeness, then crowd), topped up with a
 * stable pick of crowd accounts so the list looks as full as the count. Total = likeCount.
 */
export function getLikers(postId: string): LikesResponse | null {
  const row = getVisiblePostRow(postId)
  if (!row) return null
  const named = q(`
    SELECT a.* FROM post_likes pl JOIN accounts a ON a.id = pl.account_id
    WHERE pl.post_id = ?
    ORDER BY CASE a.kind WHEN 'me' THEN 0 WHEN 'cast' THEN 1 ELSE 2 END, a.closeness DESC, pl.created_at DESC
    LIMIT ?`).all(postId, LIKES_LIST_SIZE) as AccountRow[]
  const missing = Math.min(LIKES_LIST_SIZE, row.like_count) - named.length
  const filler = missing > 0 ? crowdLikers(row, named, missing) : []
  return { accounts: toAccounts([...named, ...filler]), total: row.like_count }
}

/** Crowd accounts that stand in for "the crowd" part of a like count. Same people every time. */
function crowdLikers(post: PostRow, alreadyListed: AccountRow[], count: number): AccountRow[] {
  const listed = new Set(alreadyListed.map((row) => row.id))
  const crowd = (q("SELECT * FROM accounts WHERE kind = 'crowd'").all() as AccountRow[]).filter((row) => !listed.has(row.id))
  // On my posts, the people who like them are my followers.
  const preferFollowers = post.author_id === 'me'
  return crowd
    .map((row) => ({ row, order: stableFraction(post.id + row.id) - (preferFollowers ? row.follows_me : 0) }))
    .sort((a, b) => a.order - b.order)
    .slice(0, count)
    .map((item) => item.row)
}

// ----- world actions (used by the simulation) -------------------------------------------------

/**
 * People like a post. `namedIds` get real "liked by" rows; `crowdCount` only raises the number.
 * On my posts this merges into one unread "like" notification per post (newest named liker in
 * front). Broadcasts post.stats.
 */
export function addPostLikes(postId: string, crowdCount: number, namedIds: string[] = []): void {
  const row = getVisiblePostRow(postId)
  if (!row) return
  const named = [...new Set(namedIds)].filter((id) => id !== 'me' && id !== row.author_id)
  let crowd = Math.max(0, Math.round(crowdCount))
  const groupKey = `like:${postId}`

  // A crowd-only batch on my post still gets a face: one of my followers becomes a named liker.
  if (row.author_id === 'me' && named.length === 0 && crowd > 0 && !unreadGroup(groupKey)) {
    const face = randomCrowdIds(1, { followingMe: true })[0]
    if (face) {
      named.push(face)
      crowd -= 1
    }
  }

  const time = now()
  const added: string[] = []
  tx(() => {
    for (const id of named) {
      // INSERT ... SELECT skips ids that aren't real accounts instead of failing.
      const result = q('INSERT OR IGNORE INTO post_likes (post_id, account_id, created_at) SELECT ?, id, ? FROM accounts WHERE id = ?')
        .run(postId, time, id)
      if (result.changes > 0) added.push(id)
    }
    q('UPDATE posts SET like_count = like_count + ? WHERE id = ?').run(added.length + crowd, postId)
  })

  const total = added.length + crowd
  if (total === 0) return
  if (row.author_id === 'me') {
    const actorId = added.at(-1) ?? null
    pushNotification({ kind: 'like', actorId, others: total - (actorId ? 1 : 0), postId, groupKey })
  }
  broadcastPostStats(postId)
}

/** Strangers watch a reel: raises its view count by `count` at once. Broadcasts post.stats. */
export function addPostViews(postId: string, count: number): void {
  const views = Math.max(0, Math.round(count))
  if (views === 0 || !getVisiblePostRow(postId)) return
  q('UPDATE posts SET view_count = view_count + ? WHERE id = ?').run(views, postId)
  broadcastPostStats(postId)
}

/** A character posts one of their library posts now (released, created_at = now). Broadcasts post.new. */
export function releasePost(postId: string): Post | null {
  const row = getPostRow(postId)
  if (!row || row.released === 1) return null
  q('UPDATE posts SET released = 1, created_at = ? WHERE id = ?').run(now(), postId)
  touchActive(row.author_id)
  const post = getPost(postId)
  if (post) broadcast({ type: 'post.new', post })
  return post
}

/** Save what a post's picture shows (the AI's description), so later prompts can mention it. */
export function setPostNote(postId: string, note: string): void {
  q('UPDATE posts SET ai_note = ? WHERE id = ?').run(note.slice(0, 2000), postId)
}

/** Library posts not posted yet (released = 0), in content order. Optionally for one author. */
export function getLibraryPosts(authorId?: string): PostRow[] {
  return (authorId
    ? q('SELECT * FROM posts WHERE released = 0 AND author_id = ? ORDER BY rowid').all(authorId)
    : q('SELECT * FROM posts WHERE released = 0 ORDER BY rowid').all()) as PostRow[]
}
