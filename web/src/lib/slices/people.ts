/**
 * Store slice: accounts (follow state), story trays and notifications.
 *
 * `accounts` holds the latest known state of anyone whose follow status, story ring or
 * "Active now" changed. Components read an account through useAccount(account), which merges this
 * in, so following someone or watching their story updates every avatar and button on screen.
 */
import { api } from '../api'
import { insertStory, patchStory, removeStory, toAccount } from '../merge'
import type { Slice } from '../store'
import type { Account, ID, Notification, Story, StoryTray } from '../types'

export interface PeopleSlice {
  accounts: Record<ID, Account>
  trays: StoryTray[]
  notifications: Notification[]
  notificationsCursor: string | null

  upsertAccounts: (accounts: Account[]) => void
  /** Optimistic follow; rolls back with a toast if the server says no. */
  follow: (account: Account) => Promise<void>
  unfollow: (account: Account) => Promise<void>

  setTrays: (trays: StoryTray[]) => void
  /** A live "story.new": add it to the author's tray and light up their ring. */
  addStory: (story: Story) => void
  /** Mark a story seen here and on the server (fire and forget). */
  markStorySeen: (storyId: ID) => void
  updateStoryViews: (storyId: ID, viewCount: number) => void
  /** Remove a story locally (call api.deleteStory yourself). */
  removeStoryLocal: (storyId: ID) => void

  setNotifications: (items: Notification[], nextCursor: string | null) => void
  appendNotifications: (items: Notification[], nextCursor: string | null) => void
  /** Insert, or replace by id and move to the top (merged "like" notifications update in place). */
  upsertNotification: (notification: Notification) => void
  /** Mark everything read here and on the server, and clear the badge. */
  markNotificationsRead: () => Promise<void>
}

export const createPeopleSlice: Slice<PeopleSlice> = (set, get) => {
  /** The freshest copy we have of an account, with some fields changed. */
  function withChanges(account: Account, changes: Partial<Account>): Account {
    return { ...(get().accounts[account.id] ?? toAccount(account)), ...changes }
  }

  return {
    accounts: {},
    trays: [],
    notifications: [],
    notificationsCursor: null,

    upsertAccounts: (accounts) => {
      if (accounts.length === 0) return
      set((s) => {
        const next = { ...s.accounts }
        for (const account of accounts) next[account.id] = toAccount(account)
        return { accounts: next }
      })
    },
    follow: async (account) => {
      const before = withChanges(account, {})
      get().upsertAccounts([{ ...before, iFollow: true }])
      try {
        get().upsertAccounts([await api.follow(account.id)])
      } catch {
        get().upsertAccounts([before])
        get().pushToast({ message: `Couldn't follow ${account.username}. Try again.` })
      }
    },
    unfollow: async (account) => {
      const before = withChanges(account, {})
      get().upsertAccounts([{ ...before, iFollow: false }])
      try {
        get().upsertAccounts([await api.unfollow(account.id)])
      } catch {
        get().upsertAccounts([before])
        get().pushToast({ message: `Couldn't unfollow ${account.username}. Try again.` })
      }
    },

    setTrays: (trays) => {
      set({ trays })
      get().upsertAccounts(trays.map((tray) => withChanges(tray.author, { hasStory: true, storySeen: tray.allSeen })))
    },
    addStory: (story) => {
      set((s) => ({ trays: insertStory(s.trays, story) }))
      get().upsertAccounts([withChanges(story.author, { hasStory: true, storySeen: false })])
    },
    markStorySeen: (storyId) => {
      set((s) => ({ trays: patchStory(s.trays, storyId, { seen: true }) }))
      // When that was the author's last unseen story, their ring turns gray everywhere.
      const tray = get().trays.find((t) => t.stories.some((story) => story.id === storyId))
      if (tray?.allSeen) get().upsertAccounts([withChanges(tray.author, { storySeen: true })])
      api.markStorySeen(storyId).catch(() => {})
    },
    updateStoryViews: (storyId, viewCount) => set((s) => ({ trays: patchStory(s.trays, storyId, { viewCount }) })),
    removeStoryLocal: (storyId) => {
      const tray = get().trays.find((t) => t.stories.some((story) => story.id === storyId))
      set((s) => ({ trays: removeStory(s.trays, storyId) }))
      if (tray && tray.stories.length === 1) get().upsertAccounts([withChanges(tray.author, { hasStory: false })])
    },

    setNotifications: (items, nextCursor) => set({ notifications: items, notificationsCursor: nextCursor }),
    appendNotifications: (items, nextCursor) => {
      set((s) => {
        const known = new Set(s.notifications.map((n) => n.id))
        return { notifications: [...s.notifications, ...items.filter((n) => !known.has(n.id))], notificationsCursor: nextCursor }
      })
    },
    upsertNotification: (notification) => {
      set((s) => ({ notifications: [notification, ...s.notifications.filter((n) => n.id !== notification.id)] }))
    },
    markNotificationsRead: async () => {
      set((s) => ({
        notifications: s.notifications.map((n) => (n.read ? n : { ...n, read: true })),
        badges: { ...s.badges, notifications: 0 },
      }))
      try {
        get().setBadges(await api.readNotifications())
      } catch {
        // The badge comes back with the next live update; nothing else to undo.
      }
    },
  }
}
