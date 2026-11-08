/**
 * Comments: threads under a post, the user's comment actions, and the world actions the
 * simulation uses (characters commenting, replying and liking comments).
 */
import type { Comment, CommentLikeResponse } from '../../shared/types.ts'
import { bit, newId, now, q, tx } from '../db/index.ts'
import { broadcast } from '../live.ts'
import { getAccountRow, getMeRow, touchActive } from './accounts.ts'
import { toComments } from './dto.ts'
import { pushNotification } from './notifications.ts'
import { broadcastPostStats, getPostRow, getVisiblePostRow } from './posts.ts'
import type { CommentRow } from './rows.ts'
import { mentions } from './text.ts'

export function getCommentRow(id: string): CommentRow | undefined {
  return q('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow | undefined
}

/**
 * A post's comments: top-level ones (pinned first, then mine, then oldest first), each with its
 * replies nested (oldest first). Returns [] for posts that can't be seen.
 */
export function getComments(postId: string): Comment[] {
  if (!getVisiblePostRow(postId)) return []
  const rows = q(`
    SELECT * FROM comments WHERE post_id = ?
    ORDER BY parent_id IS NOT NULL, pinned DESC, author_id = 'me' DESC, created_at, rowid`).all(postId) as CommentRow[]
  const comments = toComments(rows)
  const topLevel = comments.filter((comment) => comment.parentId === null)
  const byId = new Map(topLevel.map((comment) => [comment.id, comment]))
  // Replies were sorted after all top-level comments; put them under their parent, oldest first.
  const replies = comments.filter((comment) => comment.parentId !== null).sort((a, b) => a.createdAt - b.createdAt)
  for (const reply of replies) byId.get(reply.parentId as string)?.replies.push(reply)
  return topLevel
}

export interface NewComment {
  postId: string
  authorId: string
  text: string
  /** Reply to this comment. Replies to replies are attached to the top-level comment, like in the apps. */
  parentId?: string | null
  /** Defaults to now; the sim may backdate seed-style comments. */
  createdAt?: number
  /** false = don't notify the user (cheap emoji comments from strangers would flood Activity). */
  notify?: boolean
}

/**
 * Add a comment (anyone, including the user). Raises the post's comment count, notifies the user
 * when it's about them ("reply" to my comment, "mention" of @me, a new top-level "comment" on my
 * post; replies between other people under my post don't notify), and broadcasts comment.new +
 * post.stats. Returns null if the post or parent comment doesn't exist.
 */
export function addComment(input: NewComment): Comment | null {
  const post = getVisiblePostRow(input.postId)
  const author = getAccountRow(input.authorId)
  if (!post || !author) return null
  const parent = input.parentId ? getCommentRow(input.parentId) : undefined
  if (input.parentId && (!parent || parent.post_id !== post.id)) return null

  const id = newId('cm')
  const createdAt = Math.min(input.createdAt ?? now(), now())
  tx(() => {
    q(`INSERT INTO comments (id, post_id, author_id, parent_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, post.id, author.id, parent ? parent.parent_id ?? parent.id : null, input.text, createdAt)
    q('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?').run(post.id)
  })
  if (author.kind === 'cast') touchActive(author.id)

  // One notification per comment, the most personal kind first.
  if (author.id !== 'me' && input.notify !== false) {
    const me = getMeRow()
    const kind = parent?.author_id === 'me' ? 'reply'
      : me && mentions(input.text, me.username) ? 'mention'
      : post.author_id === 'me' && !parent ? 'comment'
      : null
    if (kind) pushNotification({ kind, actorId: author.id, postId: post.id, commentId: id, text: input.text })
  }

  const comment = toComments([getCommentRow(id) as CommentRow])[0]
  broadcast({ type: 'comment.new', comment })
  broadcastPostStats(post.id)
  return comment
}

function broadcastCommentStats(commentId: string): void {
  const row = getCommentRow(commentId)
  if (row) {
    broadcast({ type: 'comment.stats', postId: row.post_id, commentId, likeCount: row.like_count, likedByAuthor: row.liked_by_author === 1 })
  }
}

/**
 * Someone (not the user) likes a comment. byAuthor = the post's author hearted it. `crowd` adds
 * that many strangers' likes along with this one (just a number, like addPostLikes), so a big
 * account's comments can collect thousands of likes in one broadcast. Liking my comment notifies
 * me (merged per comment). Named comment likers aren't stored, so the sim should avoid liking the
 * same comment twice with the same account.
 */
export function likeComment(commentId: string, accountId: string, options: { byAuthor?: boolean; crowd?: number } = {}): void {
  const comment = getCommentRow(commentId)
  if (!comment || accountId === 'me' || !getAccountRow(accountId)) return
  const crowd = Math.max(0, Math.round(options.crowd ?? 0))
  q('UPDATE comments SET like_count = like_count + ?, liked_by_author = MAX(liked_by_author, ?) WHERE id = ?')
    .run(1 + crowd, bit(options.byAuthor), commentId)
  if (comment.author_id === 'me') {
    pushNotification({
      kind: 'comment_like', actorId: accountId, others: crowd, postId: comment.post_id, commentId, text: comment.text,
      groupKey: `comment_like:${commentId}`,
    })
  }
  broadcastCommentStats(commentId)
}

/** The user hearts or un-hearts a comment. On my own posts that is also the author's heart. */
export function setMyCommentLike(commentId: string, liked: boolean): CommentLikeResponse | null {
  const comment = getCommentRow(commentId)
  const post = comment ? getVisiblePostRow(comment.post_id) : undefined
  if (!comment || !post) return null
  if ((comment.liked_by_me === 1) !== liked) {
    const authorHeart = post.author_id === 'me' ? bit(liked) : comment.liked_by_author
    q('UPDATE comments SET liked_by_me = ?, like_count = MAX(0, like_count + ?), liked_by_author = ? WHERE id = ?')
      .run(bit(liked), liked ? 1 : -1, authorHeart, commentId)
    broadcastCommentStats(commentId)
  }
  const fresh = getCommentRow(commentId) as CommentRow
  return { likeCount: fresh.like_count, likedByMe: fresh.liked_by_me === 1 }
}

/** Pin or unpin a top-level comment on one of my posts. Returns the new state, or null if not allowed. */
export function togglePin(commentId: string): boolean | null {
  const comment = getCommentRow(commentId)
  if (!comment || comment.parent_id || getPostRow(comment.post_id)?.author_id !== 'me') return null
  const pinned = comment.pinned !== 1
  q('UPDATE comments SET pinned = ? WHERE id = ?').run(bit(pinned), commentId)
  return pinned
}

/** May the user delete this comment? Their own comments, or any comment on their post. */
export function canDeleteComment(comment: CommentRow): boolean {
  return comment.author_id === 'me' || getPostRow(comment.post_id)?.author_id === 'me'
}

/** Delete a comment and its replies, lowering the post's comment count. Broadcasts comment.deleted + post.stats. */
export function deleteComment(commentId: string): void {
  const comment = getCommentRow(commentId)
  if (!comment) return
  const replies = (q('SELECT COUNT(*) AS n FROM comments WHERE parent_id = ?').get(commentId) as { n: number }).n
  tx(() => {
    q('DELETE FROM comments WHERE id = ?').run(commentId) // replies go too (ON DELETE CASCADE)
    q('UPDATE posts SET comment_count = MAX(0, comment_count - ?) WHERE id = ?').run(1 + replies, comment.post_id)
  })
  broadcast({ type: 'comment.deleted', postId: comment.post_id, commentId })
  broadcastPostStats(comment.post_id)
}
