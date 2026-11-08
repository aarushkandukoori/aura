/**
 * Pure helpers that return updated copies of nested data (comment threads, story trays, chats).
 * The store uses them so its actions stay short. None of these change their inputs.
 */
import type { Account, Comment, ID, Message, Story, StoryTray } from './types'

/** Keep only the Account fields of a Profile/Me, so cached accounts never carry stale profile counts. */
export function toAccount(account: Account): Account {
  return {
    id: account.id,
    kind: account.kind,
    username: account.username,
    displayName: account.displayName,
    avatar: account.avatar,
    verified: account.verified,
    role: account.role,
    followsMe: account.followsMe,
    iFollow: account.iFollow,
    hasStory: account.hasStory,
    storySeen: account.storySeen,
    lastActiveAt: account.lastActiveAt,
  }
}

// ----- comments: top-level comments, each with its replies -----

function containsComment(list: Comment[], id: ID): boolean {
  return list.some((comment) => comment.id === id || comment.replies.some((reply) => reply.id === id))
}

/**
 * Add a comment (or a reply) to a post's thread, ignoring duplicates (a comment I post comes back
 * both from the API and from the live stream). Order matches the server: pinned, then mine, then the rest.
 */
export function insertComment(list: Comment[], comment: Comment): Comment[] {
  if (containsComment(list, comment.id)) return list
  const fresh = { ...comment, replies: comment.replies ?? [] }

  if (fresh.parentId) {
    // Replies go under their top-level comment (also when the parent is itself a reply).
    return list.map((top) =>
      top.id === fresh.parentId || top.replies.some((reply) => reply.id === fresh.parentId)
        ? { ...top, replies: [...top.replies, fresh] }
        : top,
    )
  }

  if (fresh.author.kind === 'me') {
    let insertAt = 0
    while (insertAt < list.length && (list[insertAt].pinned || list[insertAt].author.kind === 'me')) insertAt++
    return [...list.slice(0, insertAt), fresh, ...list.slice(insertAt)]
  }
  return [...list, fresh]
}

/** Change fields on one comment or reply. */
export function patchComment(list: Comment[], commentId: ID, patch: Partial<Comment>): Comment[] {
  return list.map((top) => {
    if (top.id === commentId) return { ...top, ...patch }
    if (!top.replies.some((reply) => reply.id === commentId)) return top
    return { ...top, replies: top.replies.map((reply) => (reply.id === commentId ? { ...reply, ...patch } : reply)) }
  })
}

/** Remove one comment (with its replies) or one reply. */
export function removeComment(list: Comment[], commentId: ID): Comment[] {
  return list
    .filter((top) => top.id !== commentId)
    .map((top) =>
      top.replies.some((reply) => reply.id === commentId)
        ? { ...top, replies: top.replies.filter((reply) => reply.id !== commentId) }
        : top,
    )
}

// ----- story trays: my tray first, then everyone else's -----

function isMyTray(tray: StoryTray): boolean {
  return tray.author.kind === 'me'
}

/** Add a new story to its author's tray (creating the tray) and move that tray to the front. */
export function insertStory(trays: StoryTray[], story: Story): StoryTray[] {
  const existing = trays.find((tray) => tray.author.id === story.author.id)
  if (existing?.stories.some((s) => s.id === story.id)) return trays

  const stories = [...(existing?.stories ?? []), story].sort((a, b) => a.createdAt - b.createdAt)
  const tray: StoryTray = {
    author: story.author,
    stories,
    allSeen: stories.every((s) => s.seen),
    latestAt: Math.max(existing?.latestAt ?? 0, story.createdAt),
  }
  const others = trays.filter((t) => t.author.id !== story.author.id)
  if (isMyTray(tray)) return [tray, ...others]
  // Fresh stories go right after mine, at the front of the unseen trays.
  const mineFirst = others.length > 0 && isMyTray(others[0]) ? 1 : 0
  return [...others.slice(0, mineFirst), tray, ...others.slice(mineFirst)]
}

/** Change fields on one story and recompute its tray's allSeen. */
export function patchStory(trays: StoryTray[], storyId: ID, patch: Partial<Story>): StoryTray[] {
  return trays.map((tray) => {
    if (!tray.stories.some((s) => s.id === storyId)) return tray
    const stories = tray.stories.map((s) => (s.id === storyId ? { ...s, ...patch } : s))
    return { ...tray, stories, allSeen: stories.every((s) => s.seen) }
  })
}

/** Remove one story; a tray with no stories left disappears. */
export function removeStory(trays: StoryTray[], storyId: ID): StoryTray[] {
  return trays
    .map((tray) => ({ ...tray, stories: tray.stories.filter((s) => s.id !== storyId) }))
    .filter((tray) => tray.stories.length > 0)
}

// ----- messages: oldest -> newest -----

/** Add a message or replace the copy we already have, keeping time order. */
export function insertMessage(list: Message[], message: Message): Message[] {
  if (list.some((m) => m.id === message.id)) return list.map((m) => (m.id === message.id ? message : m))
  const next = [...list, message]
  const outOfOrder = list.length > 0 && list[list.length - 1].createdAt > message.createdAt
  return outOfOrder ? next.sort((a, b) => a.createdAt - b.createdAt) : next
}
