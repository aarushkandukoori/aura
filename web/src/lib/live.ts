/**
 * Live updates. The app keeps one EventSource open on /api/live; every event the server sends is
 * written into the store (lib/store.ts), so likes, comments, DMs and followers appear without a refresh.
 *
 * Screens that want to react to an event themselves (for example to animate it in) can also
 * subscribe with useLiveEvent('notification', (event) => ...).
 */
import { useEffect, useEffectEvent } from 'react'
import { api } from './api'
import { useStore } from './store'
import type { LiveEvent } from './types'

type LiveEventOf<T extends LiveEvent['type']> = Extract<LiveEvent, { type: T }>

const listeners = new Set<(event: LiveEvent) => void>()

/** Open the stream and keep it open, reconnecting after drops. Returns a function that closes it. */
export function startLive(): () => void {
  let source: EventSource | null = null
  let retryTimer: number | undefined
  let retryDelay = 1000
  let connectedBefore = false
  let stopped = false

  function connect() {
    source = new EventSource('/api/live')
    source.onopen = () => {
      retryDelay = 1000
      useStore.getState().setConnected(true)
      // Events sent while we were disconnected are lost, so refresh what is on screen.
      if (connectedBefore) resync()
      connectedBefore = true
    }
    source.onmessage = (message) => {
      let event: LiveEvent
      try {
        event = JSON.parse(message.data)
      } catch {
        return
      }
      applyEvent(event)
      for (const listener of listeners) listener(event)
    }
    source.onerror = () => {
      useStore.getState().setConnected(false)
      // The browser retries a dropped stream by itself, but gives up for good when the server
      // answers with an error (for example while it restarts). Then we try again ourselves.
      if (source?.readyState === EventSource.CLOSED && !stopped) {
        retryTimer = window.setTimeout(reconnect, retryDelay)
        retryDelay = Math.min(retryDelay * 2, 15_000)
      }
    }
  }

  // A stream refused with 401 (signed out in another tab, or the session expired) looks like any
  // other error to EventSource, so ask the server whether we are still signed in before retrying.
  async function reconnect() {
    const session = await api.session().catch(() => null)
    if (stopped) return
    if (session?.authEnabled && !session.account) {
      useStore.getState().markSignedOut() // the session gate shows the sign-in page
      return
    }
    connect()
  }

  connect()
  return () => {
    stopped = true
    window.clearTimeout(retryTimer)
    source?.close()
    useStore.getState().setConnected(false)
  }
}

/** Run `handler` for every live event of one type while the component is mounted. */
export function useLiveEvent<T extends LiveEvent['type']>(type: T, handler: (event: LiveEventOf<T>) => void): void {
  const onEvent = useEffectEvent(handler)
  useEffect(() => {
    const listener = (event: LiveEvent) => {
      if (event.type === type) onEvent(event as LiveEventOf<T>)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [type])
}

/** Write one event into the store. */
function applyEvent(event: LiveEvent): void {
  const store = useStore.getState()
  switch (event.type) {
    case 'hello':
      store.setBadges(event.badges)
      break
    case 'notification':
      store.upsertNotification(event.notification)
      store.setBadges(event.badges)
      break
    case 'post.new':
      store.upsertPosts([event.post])
      store.noteNewPost(event.post)
      break
    case 'post.stats':
      store.updatePostStats(event)
      break
    case 'post.deleted':
      store.removePost(event.postId)
      // Deleting a post also deletes its notifications, and this event doesn't carry the new count.
      refreshBadges()
      break
    case 'comment.new':
      store.addComment(event.comment)
      break
    case 'comment.stats':
      store.updateCommentStats(event)
      break
    case 'comment.deleted':
      store.deleteCommentLocal(event.postId, event.commentId)
      break
    case 'story.new':
      store.addStory(event.story)
      break
    case 'story.deleted':
      store.removeStoryLocal(event.storyId)
      break
    case 'story.views':
      store.updateStoryViews(event.storyId, event.viewCount)
      break
    case 'message.new':
      store.upsertConversation(event.conversation)
      store.addMessage(event.message)
      store.setBadges(event.badges)
      break
    case 'message.reactions':
      store.updateMessageReactions(event.conversationId, event.messageId, event.reactions)
      break
    case 'typing':
      store.setTyping(event.conversationId, event.accountId, event.typing)
      expireTyping(event.conversationId, event.accountId, event.typing)
      break
    case 'conversation.updated':
      store.upsertConversation(event.conversation)
      store.setBadges(event.badges)
      break
    case 'conversation.deleted':
      store.removeConversation(event.conversationId) // the new unread counts follow as a 'badges' event
      break
    case 'badges':
      store.setBadges(event.badges)
      break
    case 'me.stats':
      store.applyMeStats(event)
      break
    case 'account.updated':
      store.upsertAccounts([event.account])
      break
    case 'milestone':
      store.showMilestone({ title: event.title, body: event.body })
      break
    case 'banner':
      store.pushBanner({ title: event.title, body: event.body, avatar: event.avatar, href: event.href })
      break
    case 'reset':
      // Settings > Start over: a full reload gives a clean slate.
      window.location.replace('/onboarding')
      break
  }
}

/** Fetch the nav badge counts again, for events that change them without carrying them. */
function refreshBadges(): void {
  api.badges()
    .then((badges) => useStore.getState().setBadges(badges))
    .catch(() => {}) // the next event that carries badges corrects them
}

// A "typing: true" whose "typing: false" never arrives (say the server restarted) would show the
// dots forever, so each one expires on its own after a while.
const typingTimers = new Map<string, number>()
function expireTyping(conversationId: string, accountId: string, typing: boolean): void {
  const key = `${conversationId}:${accountId}`
  window.clearTimeout(typingTimers.get(key))
  typingTimers.delete(key)
  if (!typing) return
  typingTimers.set(key, window.setTimeout(() => useStore.getState().setTyping(conversationId, accountId, false), 15_000))
}

/** After a reconnect: refresh my stats and badges, and the inbox and story trays if they were loaded. */
async function resync(): Promise<void> {
  const store = useStore.getState()
  try {
    const session = await api.session()
    if (!session.onboarded) {
      window.location.replace('/onboarding')
      return
    }
    store.setSession(session)
    if (Object.keys(store.conversations).length > 0) store.setConversations(await api.conversations())
    if (store.trays.length > 0) store.setTrays(await api.stories())
  } catch {
    // Still offline; the next reconnect tries again.
  }
}
