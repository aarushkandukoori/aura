/**
 * DTO mappers: database rows -> the exact shapes in shared/types.ts.
 *
 * Each mapper takes a whole list and loads what it needs in a few bulk queries (never one query
 * per item), so a page of 24 posts costs the same handful of queries as a page of one.
 */
import type {
  Account, Comment, Conversation, Media, Message, Notification, Post, Reaction, Story, StoryOverlay,
} from '../../shared/types.ts'
import { parseJson, q } from '../db/index.ts'
import { accountsByIds } from './accounts.ts'
import {
  jsonList, type CommentRow, type ConversationRow, type MessageRow, type NotificationRow, type PostRow, type StoryRow,
} from './rows.ts'
import { typingIn } from './typing.ts'

// ----- posts ----------------------------------------------------------------------------------

export function postMedia(row: Pick<PostRow, 'media'>): Media[] {
  return parseJson<Media[]>(row.media, [])
}

/** The picture for small places (grids, notifications). Videos use their poster frame. */
export function postThumb(row: Pick<PostRow, 'media'>): string | null {
  const first = postMedia(row)[0]
  if (!first) return null
  return first.type === 'video' ? first.poster ?? null : first.url
}

/** For each post, the best-known person who liked it: the closest to the user, never me. */
function bestLikers(postIds: string[]): Map<string, string> {
  const rows = q(`
    SELECT pl.post_id, pl.account_id FROM post_likes pl JOIN accounts a ON a.id = pl.account_id
    WHERE pl.post_id IN (SELECT value FROM json_each(?)) AND pl.account_id != 'me'
    ORDER BY a.closeness DESC, pl.created_at DESC`).all(jsonList(postIds)) as { post_id: string; account_id: string }[]
  const best = new Map<string, string>()
  for (const row of rows) if (!best.has(row.post_id)) best.set(row.post_id, row.account_id)
  return best
}

/** The "Liked by ..." account for one post (used by post.stats events). */
export function bestLiker(postId: string): Account | null {
  const id = bestLikers([postId]).get(postId)
  return id ? accountsByIds([id]).get(id) ?? null : null
}

/** Up to 2 top-level comments per post for the feed: pinned first, then the newest. Oldest first. */
function previewComments(postIds: string[]): Map<string, CommentRow[]> {
  const rows = q(`
    SELECT * FROM (
      SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.post_id ORDER BY c.pinned DESC, c.created_at DESC) AS rank
      FROM comments c
      WHERE c.parent_id IS NULL AND c.post_id IN (SELECT value FROM json_each(?))
    ) WHERE rank <= 2
    ORDER BY created_at`).all(jsonList(postIds)) as CommentRow[]
  const byPost = new Map<string, CommentRow[]>()
  for (const row of rows) byPost.set(row.post_id, [...(byPost.get(row.post_id) ?? []), row])
  return byPost
}

const NO_IDS: ReadonlySet<string> = new Set()

/** Post rows -> Post objects. Ids in `suggestedIds` get suggested: true (feed only). */
export function toPosts(rows: PostRow[], suggestedIds: ReadonlySet<string> = NO_IDS): Post[] {
  if (rows.length === 0) return []
  const postIds = rows.map((row) => row.id)
  const likers = bestLikers(postIds)
  const previews = previewComments(postIds)

  // Everyone these posts show (authors, tagged people, likers, commenters), loaded in one go.
  const accountIds = new Set<string>(likers.values())
  const taggedByPost = new Map<string, string[]>()
  for (const row of rows) {
    accountIds.add(row.author_id)
    const tagged = parseJson<string[]>(row.tagged, [])
    taggedByPost.set(row.id, tagged)
    for (const id of tagged) accountIds.add(id)
  }
  for (const list of previews.values()) for (const comment of list) accountIds.add(comment.author_id)
  const accounts = accountsByIds(accountIds)

  const posts: Post[] = []
  for (const row of rows) {
    const author = accounts.get(row.author_id)
    if (!author) continue
    const likerId = likers.get(row.id)
    posts.push({
      id: row.id,
      author,
      kind: row.kind,
      media: postMedia(row),
      caption: row.caption,
      location: row.location,
      tagged: (taggedByPost.get(row.id) ?? []).flatMap((id) => accounts.get(id) ?? []),
      audio: row.audio,
      likeCount: row.like_count,
      commentCount: row.comment_count,
      viewCount: row.view_count,
      shareCount: row.share_count,
      likedByMe: row.liked_by_me === 1,
      savedByMe: row.saved_by_me === 1,
      likedBy: likerId ? accounts.get(likerId) ?? null : null,
      previewComments: toComments(previews.get(row.id) ?? [], accounts),
      createdAt: row.created_at,
      suggested: suggestedIds.has(row.id),
    })
  }
  return posts
}

export function toPost(row: PostRow): Post | null {
  return toPosts([row])[0] ?? null
}

// ----- comments -------------------------------------------------------------------------------

/** Comment rows -> Comment objects with empty replies (getComments() nests the replies). */
export function toComments(rows: CommentRow[], knownAccounts?: Map<string, Account>): Comment[] {
  if (rows.length === 0) return []
  const accounts = knownAccounts ?? accountsByIds(rows.map((row) => row.author_id))
  return rows.flatMap((row) => {
    const author = accounts.get(row.author_id)
    if (!author) return []
    return [{
      id: row.id,
      postId: row.post_id,
      author,
      text: row.text,
      parentId: row.parent_id,
      likeCount: row.like_count,
      likedByMe: row.liked_by_me === 1,
      likedByAuthor: row.liked_by_author === 1,
      pinned: row.pinned === 1,
      createdAt: row.created_at,
      replies: [],
    }]
  })
}

// ----- stories --------------------------------------------------------------------------------

export function toStories(rows: StoryRow[]): Story[] {
  if (rows.length === 0) return []
  const accounts = accountsByIds(rows.map((row) => row.author_id))
  return rows.flatMap((row) => {
    const author = accounts.get(row.author_id)
    if (!author) return []
    return [{
      id: row.id,
      author,
      media: parseJson<Media>(row.media, { url: '', type: 'image' }),
      overlay: parseJson<StoryOverlay | null>(row.overlay, null),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      seen: row.seen === 1,
      viewCount: row.view_count,
    }]
  })
}

/** The still image of a story, kept on story-reply messages so they survive the story expiring. */
export function storyThumb(row: Pick<StoryRow, 'media'>): string {
  const media = parseJson<Media | null>(row.media, null)
  return (media?.type === 'video' ? media.poster : media?.url) ?? ''
}

// ----- notifications --------------------------------------------------------------------------

export function toNotifications(rows: NotificationRow[]): Notification[] {
  if (rows.length === 0) return []
  const actors = accountsByIds(rows.flatMap((row) => (row.actor_id ? [row.actor_id] : [])))
  const postIds = rows.flatMap((row) => (row.post_id ? [row.post_id] : []))
  const thumbs = new Map<string, string | null>()
  if (postIds.length > 0) {
    const posts = q('SELECT id, media FROM posts WHERE id IN (SELECT value FROM json_each(?))')
      .all(jsonList(postIds)) as Pick<PostRow, 'id' | 'media'>[]
    for (const post of posts) thumbs.set(post.id, postThumb(post))
  }
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    actor: row.actor_id ? actors.get(row.actor_id) ?? null : null,
    others: row.others,
    postId: row.post_id,
    postThumb: row.post_id ? thumbs.get(row.post_id) ?? null : null,
    commentId: row.comment_id,
    text: row.text,
    createdAt: row.created_at,
    read: row.read === 1,
  }))
}

// ----- messages and conversations -------------------------------------------------------------

/** Message rows -> Message objects (shared posts, story replies, quoted replies, reactions). */
export function toMessages(rows: MessageRow[]): Message[] {
  if (rows.length === 0) return []
  const senders = accountsByIds(rows.map((row) => row.sender_id))

  // Posts shared into the chat. A deleted post just shows as null.
  const sharedIds = [...new Set(rows.flatMap((row) => (row.shared_post_id ? [row.shared_post_id] : [])))]
  const sharedRows = sharedIds.length > 0
    ? q('SELECT * FROM posts WHERE released = 1 AND id IN (SELECT value FROM json_each(?))').all(jsonList(sharedIds)) as PostRow[]
    : []
  const sharedPosts = new Map(toPosts(sharedRows).map((post) => [post.id, post]))

  // The messages that replies quote. My own messages are quoted as "You".
  const replyIds = rows.flatMap((row) => (row.reply_to_id ? [row.reply_to_id] : []))
  const quotes = new Map<string, { id: string; text: string; senderName: string }>()
  if (replyIds.length > 0) {
    const quoted = q(`
      SELECT m.id, m.text, m.media, m.shared_post_id, m.sender_id, a.display_name
      FROM messages m JOIN accounts a ON a.id = m.sender_id
      WHERE m.id IN (SELECT value FROM json_each(?))`).all(jsonList(replyIds)) as
      { id: string; text: string; media: string | null; shared_post_id: string | null; sender_id: string; display_name: string }[]
    for (const row of quoted) {
      const text = row.text || (row.media ? 'Photo' : row.shared_post_id ? 'Shared a post' : '')
      quotes.set(row.id, { id: row.id, text, senderName: row.sender_id === 'me' ? 'You' : row.display_name })
    }
  }

  return rows.flatMap((row) => {
    const sender = senders.get(row.sender_id)
    if (!sender) return []
    return [{
      id: row.id,
      conversationId: row.conversation_id,
      sender,
      text: row.text,
      media: parseJson<Media | null>(row.media, null),
      sharedPost: row.shared_post_id ? sharedPosts.get(row.shared_post_id) ?? null : null,
      story: row.story_id ? { id: row.story_id, thumb: row.story_thumb ?? '' } : null,
      replyTo: row.reply_to_id ? quotes.get(row.reply_to_id) ?? null : null,
      reactions: parseJson<Reaction[]>(row.reactions, []),
      createdAt: row.created_at,
    }]
  })
}

/** Group chats without a name are called by their members' first names: "Maya, Diego, Priya +1". */
export function defaultGroupTitle(members: Account[]): string {
  const names = members.map((member) => member.displayName.split(' ')[0])
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')
}

export function toConversations(rows: ConversationRow[]): Conversation[] {
  if (rows.length === 0) return []
  const memberIds = new Map(rows.map((row) => [row.id, parseJson<string[]>(row.members, [])]))
  const accounts = accountsByIds([...memberIds.values()].flat())

  // The newest message of every conversation in one query.
  const lastRows = q(`
    SELECT * FROM (
      SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at DESC, m.rowid DESC) AS rank
      FROM messages m WHERE m.conversation_id IN (SELECT value FROM json_each(?))
    ) WHERE rank = 1`).all(jsonList(rows.map((row) => row.id))) as MessageRow[]
  const lastMessages = new Map(toMessages(lastRows).map((message) => [message.conversationId, message]))

  return rows.map((row) => {
    const members = (memberIds.get(row.id) ?? []).flatMap((id) => accounts.get(id) ?? [])
    const title = row.kind === 'dm' ? members[0]?.displayName ?? 'Aura user' : row.title || defaultGroupTitle(members)
    return {
      id: row.id,
      kind: row.kind,
      title,
      emoji: row.emoji,
      members,
      isRequest: row.is_request === 1,
      muted: row.muted === 1,
      unread: row.unread,
      lastMessage: lastMessages.get(row.id) ?? null,
      lastMessageAt: row.last_message_at,
      typing: typingIn(row.id),
      seenAt: row.seen_at,
    }
  })
}
