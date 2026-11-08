/**
 * Messages: reading a chat, the user sending, and the world actions the simulation uses
 * (characters sending messages and reacting to them).
 */
import type { Conversation, Media, Message, Page, Reaction } from '../../shared/types.ts'
import { newId, now, parseJson, q, tx } from '../db/index.ts'
import { broadcast } from '../live.ts'
import { getAccountRow, touchActive } from './accounts.ts'
import { getConversation, getConversationRow, memberIds } from './conversations.ts'
import { storyThumb, toMessages } from './dto.ts'
import { getBadges, showBanner } from './notifications.ts'
import { pageRows, readTimeCursor } from './paging.ts'
import type { ConversationRow, MessageRow } from './rows.ts'
import { getStoryRow } from './stories.ts'
import { setTyping } from './typing.ts'

const PAGE_SIZE = 40

export function getMessageRow(id: string): MessageRow | undefined {
  return q('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined
}

/** One page of a chat: 40 messages, oldest -> newest. nextCursor loads the 40 before them. */
export function getMessagesPage(conversationId: string, cursor: string | null): Page<Message> {
  const from = readTimeCursor(cursor)
  const rows = q(`
    SELECT * FROM messages WHERE conversation_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
    ORDER BY created_at DESC, id DESC LIMIT ?`).all(conversationId, from.t, from.t, from.id, PAGE_SIZE + 1) as MessageRow[]
  const page = pageRows(rows, PAGE_SIZE) // newest first, cursor = the oldest one shown
  return { items: toMessages(page.rows.reverse()), nextCursor: page.nextCursor }
}

/** The last `limit` messages of a chat, oldest first (context for AI replies). */
export function getMessages(conversationId: string, limit = 30): Message[] {
  const rows = q('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(conversationId, limit) as MessageRow[]
  return toMessages(rows.reverse())
}

interface MessageInput {
  conversationId: string
  senderId: string
  text: string
  media?: Media | null
  sharedPostId?: string | null
  replyToId?: string | null
  storyId?: string | null
  storyThumb?: string | null
}

/**
 * Insert a message and move the chat to the top of the inbox. Times only go forward inside a
 * chat (at least 1 ms apart), so two bubbles sent in the same millisecond never swap places.
 */
function insertMessage(input: MessageInput, conversation: ConversationRow): MessageRow {
  const id = newId('m')
  const createdAt = Math.max(now(), conversation.last_message_at + 1)
  q(`INSERT INTO messages (id, conversation_id, sender_id, text, media, shared_post_id, story_id, story_thumb, reply_to_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, conversation.id, input.senderId, input.text, input.media ? JSON.stringify(input.media) : null,
    input.sharedPostId ?? null, input.storyId ?? null, input.storyThumb ?? null, input.replyToId ?? null, createdAt,
  )
  q('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(createdAt, conversation.id)
  return getMessageRow(id) as MessageRow
}

/** Broadcast message.new (with the updated conversation and badges). */
function broadcastNewMessage(row: MessageRow): { message: Message; conversation: Conversation } {
  const message = toMessages([row])[0]
  const conversation = getConversation(row.conversation_id) as Conversation
  broadcast({ type: 'message.new', message, conversation, badges: getBadges() })
  return { message, conversation }
}

/**
 * The user sends a message (text, photo, shared post or story reply). Sending means the chat is
 * read, and replying to a request accepts it. Broadcasts message.new. Null for an unknown chat.
 */
export function sendMyMessage(input: Omit<MessageInput, 'senderId'>): Message | null {
  const conversation = getConversationRow(input.conversationId)
  if (!conversation) return null
  const row = tx(() => {
    const inserted = insertMessage({ ...input, senderId: 'me' }, conversation)
    q('UPDATE conversations SET unread = 0, is_request = 0 WHERE id = ?').run(conversation.id)
    return inserted
  })
  return broadcastNewMessage(row).message
}

export interface CastMessage {
  conversationId: string
  senderId: string
  text: string
  media?: Media | null
  replyToId?: string | null
  sharedPostId?: string | null
  /** A reply to one of the user's stories: the bubble shows the story's picture above it. */
  storyId?: string | null
}

/** What a banner says for a message without text. */
function bannerBody(message: Message): string {
  if (message.text) return message.text
  if (message.media) return 'Sent a photo'
  if (message.sharedPost) return 'Shared a post'
  return 'Sent a message'
}

/**
 * A character sends a message. Clears their "typing...", adds 1 to unread, marks them active,
 * broadcasts message.new and a banner (unless the chat is muted). Null if the chat doesn't exist
 * or the sender isn't in it.
 */
export function sendCastMessage(input: CastMessage): Message | null {
  const conversation = getConversationRow(input.conversationId)
  if (!conversation || !memberIds(conversation).includes(input.senderId)) return null
  const sharedPostId = input.sharedPostId && q('SELECT 1 FROM posts WHERE id = ? AND released = 1').get(input.sharedPostId)
    ? input.sharedPostId
    : null
  // The thumbnail is copied now, so the reply still shows the picture after the story expires.
  const story = input.storyId ? getStoryRow(input.storyId) : undefined
  const storyFields = story ? { storyId: story.id, storyThumb: storyThumb(story) } : { storyId: null, storyThumb: null }

  setTyping(conversation.id, input.senderId, false)
  const row = tx(() => {
    const inserted = insertMessage({ ...input, sharedPostId, ...storyFields }, conversation)
    q('UPDATE conversations SET unread = unread + 1 WHERE id = ?').run(conversation.id)
    return inserted
  })
  touchActive(input.senderId)

  const { message, conversation: updated } = broadcastNewMessage(row)
  if (conversation.muted !== 1) {
    const name = message.sender.displayName
    showBanner({
      title: conversation.kind === 'group' ? `${name} in ${updated.title}` : name,
      body: bannerBody(message),
      avatar: message.sender.avatar,
      href: `/messages/${conversation.id}`,
    })
  }
  return message
}

/**
 * Set an account's emoji reaction on a message (one per person; null removes it). Broadcasts
 * message.reactions. When a character reacts to my message, a small banner says so.
 */
export function reactToMessage(messageId: string, accountId: string, emoji: string | null): Reaction[] | null {
  const row = getMessageRow(messageId)
  const reactor = getAccountRow(accountId)
  if (!row || !reactor) return null
  const reactions = parseJson<Reaction[]>(row.reactions, []).filter((reaction) => reaction.accountId !== accountId)
  if (emoji) reactions.push({ accountId, emoji })
  q('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), messageId)
  broadcast({ type: 'message.reactions', conversationId: row.conversation_id, messageId, reactions })

  const conversation = getConversationRow(row.conversation_id)
  if (emoji && accountId !== 'me' && row.sender_id === 'me' && conversation && conversation.muted !== 1) {
    showBanner({
      title: reactor.display_name,
      body: `Reacted ${emoji} to your message`,
      avatar: reactor.avatar,
      href: `/messages/${row.conversation_id}`,
    })
  }
  return reactions
}
