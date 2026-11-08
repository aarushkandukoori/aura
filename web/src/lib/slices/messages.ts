/**
 * Store slice: conversations, messages and typing indicators.
 *
 * Conversations (the inbox and message requests together) are kept by id; read them sorted with
 * useInbox() / useRequests(). Messages are kept per conversation, oldest -> newest.
 */
import { insertMessage } from '../merge'
import type { Slice } from '../store'
import type { Conversation, ConversationsResponse, ID, Message, Reaction } from '../types'

export interface MessagesSlice {
  conversations: Record<ID, Conversation>
  messages: Record<ID, Message[]>
  /** Cursor for loading older messages; null when the start of the chat is loaded. */
  messageCursors: Record<ID, string | null>
  /** Ids of members typing right now, by conversation. */
  typing: Record<ID, ID[]>

  setConversations: (response: ConversationsResponse) => void
  upsertConversation: (conversation: Conversation) => void
  removeConversation: (conversationId: ID) => void
  setMessages: (conversationId: ID, messages: Message[], nextCursor: string | null) => void
  prependMessages: (conversationId: ID, older: Message[], nextCursor: string | null) => void
  /** Add a live or just-sent message (duplicates are replaced, not repeated). Only for loaded chats. */
  addMessage: (message: Message) => void
  /** Swap an optimistic message (temporary id) for the real one from the server. */
  replaceMessage: (conversationId: ID, oldId: ID, message: Message) => void
  removeMessage: (conversationId: ID, messageId: ID) => void
  updateMessageReactions: (conversationId: ID, messageId: ID, reactions: Reaction[]) => void
  setTyping: (conversationId: ID, accountId: ID, typing: boolean) => void
}

export const createMessagesSlice: Slice<MessagesSlice> = (set, get) => {
  /** Apply a change to one chat's messages (does nothing if that chat isn't loaded). */
  function updateChat(conversationId: ID, change: (list: Message[]) => Message[]) {
    set((s) => (s.messages[conversationId] ? { messages: { ...s.messages, [conversationId]: change(s.messages[conversationId]) } } : {}))
  }

  return {
    conversations: {},
    messages: {},
    messageCursors: {},
    typing: {},

    setConversations: ({ conversations, requests }) => {
      const all = [...conversations, ...requests]
      set((s) => {
        const byId: Record<ID, Conversation> = {}
        const typing = { ...s.typing }
        for (const conversation of all) {
          byId[conversation.id] = conversation
          typing[conversation.id] = conversation.typing
        }
        return { conversations: byId, typing }
      })
      get().upsertAccounts(all.flatMap((c) => c.members))
    },
    upsertConversation: (conversation) => {
      set((s) => ({
        conversations: { ...s.conversations, [conversation.id]: conversation },
        typing: { ...s.typing, [conversation.id]: conversation.typing },
      }))
    },
    removeConversation: (conversationId) => {
      set((s) => {
        const conversations = { ...s.conversations }
        delete conversations[conversationId]
        return { conversations }
      })
    },

    setMessages: (conversationId, messages, nextCursor) => {
      set((s) => ({
        messages: { ...s.messages, [conversationId]: messages },
        messageCursors: { ...s.messageCursors, [conversationId]: nextCursor },
      }))
    },
    prependMessages: (conversationId, older, nextCursor) => {
      set((s) => {
        const current = s.messages[conversationId] ?? []
        const known = new Set(current.map((m) => m.id))
        return {
          messages: { ...s.messages, [conversationId]: [...older.filter((m) => !known.has(m.id)), ...current] },
          messageCursors: { ...s.messageCursors, [conversationId]: nextCursor },
        }
      })
    },
    addMessage: (message) => {
      const { conversationId } = message
      updateChat(conversationId, (list) => insertMessage(list, message))
      // Whoever just sent a message has stopped typing.
      get().setTyping(conversationId, message.sender.id, false)
      // Keep the inbox preview current even before the server's conversation update arrives.
      const conversation = get().conversations[conversationId]
      if (conversation && message.createdAt >= conversation.lastMessageAt) {
        set((s) => ({
          conversations: { ...s.conversations, [conversationId]: { ...conversation, lastMessage: message, lastMessageAt: message.createdAt } },
        }))
      }
    },
    replaceMessage: (conversationId, oldId, message) => {
      set((s) => {
        const list = (s.messages[conversationId] ?? []).filter((m) => m.id !== oldId)
        return { messages: { ...s.messages, [conversationId]: insertMessage(list, message) } }
      })
    },
    removeMessage: (conversationId, messageId) => updateChat(conversationId, (list) => list.filter((m) => m.id !== messageId)),
    updateMessageReactions: (conversationId, messageId, reactions) =>
      updateChat(conversationId, (list) => list.map((m) => (m.id === messageId ? { ...m, reactions } : m))),
    setTyping: (conversationId, accountId, typing) => {
      set((s) => {
        const current = s.typing[conversationId] ?? []
        if (typing === current.includes(accountId)) return {}
        const next = typing ? [...current, accountId] : current.filter((id) => id !== accountId)
        return { typing: { ...s.typing, [conversationId]: next } }
      })
    },
  }
}
