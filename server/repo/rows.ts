/**
 * Row types: exactly what SELECT * returns for each table in server/db/schema.sql.
 * Booleans are 0/1 numbers and JSON columns are still strings here; the DTO mappers turn rows
 * into the shapes in shared/types.ts.
 *
 * These are `type` aliases, not interfaces, on purpose: node:sqlite returns rows typed as
 * Record<string, value>, and TypeScript only allows casting those to plain object types.
 */
import type { AccountKind, NotificationKind, Role } from '../../shared/types.ts'

export type AccountRow = {
  id: string
  kind: AccountKind
  username: string
  display_name: string
  avatar: string | null
  bio: string
  pronouns: string
  location: string | null
  occupation: string | null
  verified: number
  role: Role | null
  persona: string | null
  followers: number
  following: number
  follows_me: number
  i_follow: number
  closeness: number
  last_active_at: number | null
  created_at: number
}

export type PostRow = {
  id: string
  author_id: string
  kind: 'photo' | 'carousel' | 'reel'
  media: string
  caption: string
  location: string | null
  tagged: string
  audio: string | null
  like_count: number
  comment_count: number
  view_count: number
  share_count: number
  liked_by_me: number
  saved_by_me: number
  ai_note: string | null
  source_id: string | null
  released: number
  created_at: number
}

export type CommentRow = {
  id: string
  post_id: string
  author_id: string
  parent_id: string | null
  text: string
  like_count: number
  liked_by_me: number
  liked_by_author: number
  pinned: number
  created_at: number
}

export type StoryRow = {
  id: string
  author_id: string
  media: string
  overlay: string | null
  source_id: string | null
  released: number
  seen: number
  view_count: number
  created_at: number
  expires_at: number
}

export type ConversationRow = {
  id: string
  kind: 'dm' | 'group'
  title: string | null
  emoji: string | null
  members: string
  vibe: string | null
  is_request: number
  muted: number
  unread: number
  seen_at: number | null
  last_message_at: number
  created_at: number
}

export type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  text: string
  media: string | null
  shared_post_id: string | null
  story_id: string | null
  story_thumb: string | null
  reply_to_id: string | null
  reactions: string
  created_at: number
}

export type NotificationRow = {
  id: string
  kind: NotificationKind
  actor_id: string | null
  others: number
  post_id: string | null
  comment_id: string | null
  text: string | null
  group_key: string | null
  read: number
  created_at: number
}

/**
 * SQLite cannot bind an array, so id lists travel as one JSON string and the SQL reads them with
 * `IN (SELECT value FROM json_each(?))`. One SQL text for any list length keeps statements cached.
 */
export const jsonList = (ids: Iterable<string>): string => JSON.stringify([...ids])
