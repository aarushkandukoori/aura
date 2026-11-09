/**
 * The app's shared state (zustand). Screens read from it, and lib/live.ts writes every live server
 * event into it, so a like, a comment or a DM shows up on every screen at once.
 *
 * The state is built from four slices (one file each in lib/slices/), plus sign-in:
 *   session   ready, onboarded, me, settings, badges, banners, toasts, milestone, theme, connected
 *   posts     posts[id] (cache every PostCard reads), postLists[key], newPostIds, comments[postId]
 *   people    accounts[id] (live follow/story/active state), trays, notifications, notificationsCursor
 *   messages  conversations[id], messages[conversationId], messageCursors, typing[conversationId]
 *   auth      authEnabled, account (the signed-in Google account), signOut (features/auth/slice.ts)
 *
 * Read with a selector:   const me = useStore((s) => s.me)
 * Call actions anywhere:  useStore.getState().toggleLike(post)
 * A selector that builds a new array or object on every call must be wrapped in useShallow
 * (like useInbox below), otherwise React re-renders forever.
 */
import { create, type StateCreator } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { createAuthSlice, type AuthSlice } from '../features/auth/slice'
import { createMessagesSlice, type MessagesSlice } from './slices/messages'
import { createPeopleSlice, type PeopleSlice } from './slices/people'
import { createPostsSlice, type PostsSlice } from './slices/posts'
import { createSessionSlice, type SessionSlice } from './slices/session'
import type { Account, Conversation, ID, Me, Post } from './types'

export type AuraState = SessionSlice & PostsSlice & PeopleSlice & MessagesSlice & AuthSlice

/** The type of one slice creator: it gets the whole store's set/get and returns its part. */
export type Slice<T> = StateCreator<AuraState, [], [], T>

export const useStore = create<AuraState>()((...args) => {
  const [set] = args
  const session = createSessionSlice(...args)
  return {
    ...session,
    ...createPostsSlice(...args),
    ...createPeopleSlice(...args),
    ...createMessagesSlice(...args),
    ...createAuthSlice(...args),
    // Every Session also says whether sign-in is on and who is signed in.
    setSession: (value) => {
      set({ authEnabled: value.authEnabled, account: value.account })
      session.setSession(value)
    },
  }
})

export type { Banner, Milestone, Toast } from './slices/session'
export type { PostList } from './slices/posts'

// ----- hooks for common reads -----

/** The signed-in person. Only use inside the app: the session gate guarantees `me` is loaded there. */
export function useMe(): Me {
  const me = useStore((s) => s.me)
  if (!me) throw new Error('useMe() was called before the session loaded')
  return me
}

/** The cached copy of a post (with live stats), or undefined if it isn't cached. */
export function usePost(postId: ID): Post | undefined {
  return useStore((s) => s.posts[postId])
}

/** An account with its latest follow / story-ring / "Active now" state merged in from live updates. */
export function useAccount<T extends Account>(account: T): T {
  const live = useStore((s) => s.accounts[account.id])
  return live ? { ...account, ...live } : account
}

const byNewest = (a: Conversation, b: Conversation) => b.lastMessageAt - a.lastMessageAt

/** Conversations in the Primary inbox, newest activity first. */
export function useInbox(): Conversation[] {
  return useStore(useShallow((s) => Object.values(s.conversations).filter((c) => !c.isRequest).sort(byNewest)))
}

/** Message requests, newest first. */
export function useRequests(): Conversation[] {
  return useStore(useShallow((s) => Object.values(s.conversations).filter((c) => c.isRequest).sort(byNewest)))
}

const NOBODY: ID[] = []

/** Ids of the members typing in a conversation right now. */
export function useTyping(conversationId: ID): ID[] {
  return useStore((s) => s.typing[conversationId] ?? NOBODY)
}
