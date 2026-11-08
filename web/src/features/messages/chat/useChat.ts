/**
 * Everything one open chat needs from the server: the conversation (fetched when the inbox doesn't
 * have it yet), its newest messages, older pages on demand, and read receipts.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '../../../components'
import { api, ApiError } from '../../../lib/api'
import { useStore } from '../../../lib/store'
import type { Conversation, ID, Message, Page } from '../../../lib/types'

export interface ChatState {
  conversation: Conversation | undefined
  /** undefined until the first page has loaded. Oldest -> newest. */
  messages: Message[] | undefined
  hasOlder: boolean
  loadingOlder: boolean
  loadOlder: () => void
  /** The chat doesn't exist (deleted, or a wrong link). */
  notFound: boolean
  error: string | null
  retry: () => void
}

export function useChat(conversationId: ID): ChatState {
  const conversation = useStore((s) => s.conversations[conversationId])
  const messages = useStore((s) => s.messages[conversationId])
  const cursor = useStore((s) => s.messageCursors[conversationId] ?? null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const loadingOlderRef = useRef(false)

  function fail(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 404) setNotFound(true)
    else setError(cause instanceof Error ? cause.message : 'Something went wrong')
  }

  // The conversation itself, when the chat was opened before the inbox loaded (a link, a banner).
  const known = conversation !== undefined
  useEffect(() => {
    if (known) return
    let cancelled = false
    api.conversation(conversationId)
      .then((loaded) => {
        if (!cancelled) useStore.getState().upsertConversation(loaded)
      })
      .catch((cause) => {
        if (!cancelled) fail(cause)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId, known, attempt])

  // The newest page: a cached chat shows at once and this fills in anything that arrived meanwhile.
  useEffect(() => {
    let cancelled = false
    setError(null)
    api.messages(conversationId)
      .then((page) => {
        if (!cancelled) mergeNewestPage(conversationId, page)
      })
      .catch((cause) => {
        if (!cancelled) fail(cause)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId, attempt])

  const loadOlder = useCallback(async () => {
    const olderCursor = useStore.getState().messageCursors[conversationId]
    if (!olderCursor || loadingOlderRef.current) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const page = await api.messages(conversationId, olderCursor)
      useStore.getState().prependMessages(conversationId, page.items, page.nextCursor)
    } catch {
      toast("Couldn't load older messages")
    } finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
  }, [conversationId])

  // Read receipts: reading a chat clears its unread count (and the nav badge). New messages that
  // arrive while it is open are read right away, but only while the page is actually visible.
  const unread = conversation?.unread ?? 0
  useEffect(() => {
    if (unread === 0) return
    const readIfVisible = () => {
      if (document.visibilityState === 'visible') markRead(conversationId)
    }
    readIfVisible()
    document.addEventListener('visibilitychange', readIfVisible)
    return () => document.removeEventListener('visibilitychange', readIfVisible)
  }, [conversationId, unread])

  const retry = useCallback(() => {
    setNotFound(false)
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { conversation, messages, hasOlder: cursor !== null, loadingOlder, loadOlder, notFound, error, retry }
}

/** Put the newest page into the store, keeping older pages and unsent messages already loaded. */
function mergeNewestPage(conversationId: ID, page: Page<Message>): void {
  const store = useStore.getState()
  const cached = store.messages[conversationId]
  const overlaps = cached?.some((message) => page.items.some((item) => item.id === message.id)) ?? false
  // Nothing cached, or a gap between the cache and this page: start over from this page.
  if (!cached || (!overlaps && page.nextCursor !== null)) {
    store.setMessages(conversationId, page.items, page.nextCursor)
    return
  }
  const byId = new Map(cached.map((message) => [message.id, message]))
  for (const message of page.items) byId.set(message.id, message)
  const merged = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt)
  store.setMessages(conversationId, merged, store.messageCursors[conversationId] ?? null)
}

/** Clear a chat's unread count here (at once) and on the server, then use the fresh badges. */
function markRead(conversationId: ID): void {
  const store = useStore.getState()
  const conversation = store.conversations[conversationId]
  if (conversation && conversation.unread > 0) store.upsertConversation({ ...conversation, unread: 0 })
  api.readConversation(conversationId)
    .then((badges) => useStore.getState().setBadges(badges))
    .catch(() => {})
}
