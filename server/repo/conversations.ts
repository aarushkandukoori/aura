/**
 * Conversations (DMs and group chats): the inbox, starting chats, rename / emoji / mute, message
 * requests, and read / seen state.
 */
import type { Badges, Conversation, ConversationsResponse } from '../../shared/types.ts'
import { bit, newId, now, parseJson, q } from '../db/index.ts'
import { broadcast } from '../live.ts'
import { toConversations } from './dto.ts'
import { getBadges } from './notifications.ts'
import { jsonList, type ConversationRow } from './rows.ts'
import { forgetTyping } from './typing.ts'

export function getConversationRow(id: string): ConversationRow | undefined {
  return q('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined
}

/** Member ids of a conversation (never includes 'me'). */
export function memberIds(row: Pick<ConversationRow, 'members'>): string[] {
  return parseJson<string[]>(row.members, [])
}

export function getConversation(id: string): Conversation | null {
  const row = getConversationRow(id)
  return row ? toConversations([row])[0] : null
}

/** Every conversation, requests included, newest activity first. */
export function listConversations(): Conversation[] {
  const rows = q('SELECT * FROM conversations ORDER BY last_message_at DESC, id').all() as ConversationRow[]
  return toConversations(rows)
}

/** The inbox: conversations (newest activity first) and message requests, kept apart. */
export function getInbox(): ConversationsResponse {
  const all = listConversations()
  return {
    conversations: all.filter((conversation) => !conversation.isRequest),
    requests: all.filter((conversation) => conversation.isRequest),
  }
}

/** Tell every open app that a conversation changed, with fresh badges. */
export function broadcastConversation(id: string): void {
  const conversation = getConversation(id)
  if (conversation) broadcast({ type: 'conversation.updated', conversation, badges: getBadges() })
}

/**
 * The DM with this account, created when there isn't one yet. isRequest makes a brand-new DM a
 * message request (someone writing first). Doesn't broadcast: the first message does.
 * Null for unknown accounts.
 */
export function getOrCreateDm(accountId: string, options: { isRequest?: boolean } = {}): Conversation | null {
  if (accountId === 'me' || !q('SELECT 1 FROM accounts WHERE id = ?').get(accountId)) return null
  const members = JSON.stringify([accountId])
  const existing = q("SELECT id FROM conversations WHERE kind = 'dm' AND members = ?").get(members) as { id: string } | undefined
  if (existing) return getConversation(existing.id)

  const id = newId('c')
  const time = now()
  q(`INSERT INTO conversations (id, kind, members, is_request, last_message_at, created_at)
     VALUES (?, 'dm', ?, ?, ?, ?)`).run(id, members, bit(options.isRequest), time, time)
  return getConversation(id)
}

export interface NewGroup {
  memberIds: string[]
  /** Empty = named after the members' first names. */
  title?: string | null
  emoji?: string | null
  /** What the chat is about, for the AI ("plans, memes, sports"). */
  vibe?: string | null
}

/**
 * A new group chat with these members plus me (unknown ids and 'me' are left out). Doesn't
 * broadcast: the first message does. Null when none of the members exist.
 */
export function createGroup(input: NewGroup): Conversation | null {
  const known = q("SELECT id FROM accounts WHERE kind != 'me' AND id IN (SELECT value FROM json_each(?))").all(jsonList(input.memberIds))
  const knownIds = new Set(known.map((row) => String(row.id)))
  const members = [...new Set(input.memberIds)].filter((memberId) => knownIds.has(memberId))
  if (members.length === 0) return null

  const id = newId('c')
  const time = now()
  q(`INSERT INTO conversations (id, kind, title, emoji, members, vibe, last_message_at, created_at)
     VALUES (?, 'group', ?, ?, ?, ?, ?, ?)`).run(
    id, input.title?.trim() || null, input.emoji ?? null, JSON.stringify(members), input.vibe ?? null, time, time,
  )
  return getConversation(id)
}

/** Rename, change the emoji, or mute a conversation. Broadcasts conversation.updated. */
export function updateConversation(
  id: string,
  changes: { title?: string | null; emoji?: string | null; muted?: boolean },
): Conversation | null {
  const row = getConversationRow(id)
  if (!row) return null
  q('UPDATE conversations SET title = ?, emoji = ?, muted = ? WHERE id = ?').run(
    changes.title !== undefined ? changes.title?.trim() || null : row.title,
    changes.emoji !== undefined ? changes.emoji : row.emoji,
    changes.muted !== undefined ? bit(changes.muted) : row.muted,
    id,
  )
  broadcastConversation(id)
  return getConversation(id)
}

/** Accept a message request: it moves into the main inbox. */
export function acceptRequest(id: string): Conversation | null {
  q('UPDATE conversations SET is_request = 0 WHERE id = ?').run(id)
  broadcastConversation(id)
  return getConversation(id)
}

/** Delete a conversation and all its messages. Broadcasts conversation.deleted and the new badges (it may have been unread). */
export function deleteConversation(id: string): void {
  q('DELETE FROM conversations WHERE id = ?').run(id)
  forgetTyping(id)
  broadcast({ type: 'conversation.deleted', conversationId: id })
  broadcast({ type: 'badges', badges: getBadges() })
}

/** The other side read my messages ("Seen"). Broadcasts conversation.updated. */
export function markSeen(conversationId: string): void {
  const result = q('UPDATE conversations SET seen_at = ? WHERE id = ?').run(now(), conversationId)
  if (result.changes) broadcastConversation(conversationId)
}

/** I read a conversation: unread goes back to 0. Broadcasts and returns fresh badges. */
export function markRead(conversationId: string): Badges {
  q('UPDATE conversations SET unread = 0 WHERE id = ?').run(conversationId)
  broadcastConversation(conversationId)
  const badges = getBadges()
  broadcast({ type: 'badges', badges })
  return badges
}
