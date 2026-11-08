/**
 * Store slice: posts and comments.
 *
 * `posts` is a cache by id. Pages put the posts they fetch here (upsertPosts) and every PostCard
 * reads its post back with usePost(id), so a live "post.stats" event updates the post everywhere.
 */
import { api } from '../api'
import { insertComment, patchComment, removeComment } from '../merge'
import type { Slice } from '../store'
import type { Account, Comment, ID, Post } from '../types'

/** A paged list of post ids (the feed, a profile grid, a tag page...). See lib/lists.ts. */
export interface PostList { ids: ID[]; cursor: string | null; done: boolean }
export type PostStats = { postId: ID; likeCount: number; commentCount: number; viewCount: number; shareCount: number; likedBy: Account | null }
export type CommentStats = { postId: ID; commentId: ID; likeCount: number; likedByAuthor: boolean }

export interface PostsSlice {
  posts: Record<ID, Post>
  postLists: Record<string, PostList>
  /** Posts from people I follow that went live since the feed last showed them ("New posts" pill). */
  newPostIds: ID[]
  /** Top-level comments (each with its replies) by post id. */
  comments: Record<ID, Comment[]>

  upsertPosts: (posts: Post[]) => void
  updatePostStats: (stats: PostStats) => void
  /** Optimistic like/unlike: flips at once, then confirms with the server or rolls back. */
  toggleLike: (post: Post) => Promise<void>
  /** Optimistic save/unsave, same as toggleLike. */
  toggleSave: (post: Post) => Promise<void>
  /** Drop a deleted post from the cache, every list and the "New posts" queue. */
  removePost: (postId: ID) => void
  /** Called for every live "post.new": my posts jump into the feed, others queue for the pill. */
  noteNewPost: (post: Post) => void
  clearNewPosts: () => void
  setPostList: (key: string, posts: Post[], cursor: string | null) => void
  appendPostList: (key: string, posts: Post[], cursor: string | null) => void
  prependToPostList: (key: string, postIds: ID[]) => void

  setComments: (postId: ID, comments: Comment[]) => void
  /**
   * Add a live or just-posted comment/reply (duplicates are ignored) to the post's thread, if it is
   * loaded, and a top-level one to the feed card's preview comments, if the post is cached.
   */
  addComment: (comment: Comment) => void
  updateCommentStats: (stats: CommentStats) => void
  /** Optimistic heart on a comment. */
  toggleCommentLike: (comment: Comment) => Promise<void>
  setCommentPinned: (postId: ID, commentId: ID, pinned: boolean) => void
  /** Remove a comment locally, from its thread and the feed preview (call api.deleteComment yourself). */
  deleteCommentLocal: (postId: ID, commentId: ID) => void
}

function unique(ids: ID[]): ID[] {
  return [...new Set(ids)]
}

/** The 2 comments a feed card previews, picked like the server does: pinned first, then the newest; shown oldest first. */
function pickPreviews(comments: Comment[]): Comment[] {
  const ranked = [...comments].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
  return ranked.slice(0, 2).sort((a, b) => a.createdAt - b.createdAt)
}

export const createPostsSlice: Slice<PostsSlice> = (set, get) => {
  /** Change some fields of a cached post (does nothing if it isn't cached). */
  function patchPost(postId: ID, patch: Partial<Post>) {
    set((s) => (s.posts[postId] ? { posts: { ...s.posts, [postId]: { ...s.posts[postId], ...patch } } } : {}))
  }

  /** Apply a change to one post's comment thread (does nothing if those comments aren't loaded). */
  function updateThread(postId: ID, change: (list: Comment[]) => Comment[]) {
    set((s) => (s.comments[postId] ? { comments: { ...s.comments, [postId]: change(s.comments[postId]) } } : {}))
  }

  return {
    posts: {},
    postLists: {},
    newPostIds: [],
    comments: {},

    upsertPosts: (posts) => {
      if (posts.length === 0) return
      set((s) => {
        const next = { ...s.posts }
        for (const post of posts) next[post.id] = post
        return { posts: next }
      })
    },
    updatePostStats: ({ postId, likeCount, commentCount, viewCount, shareCount, likedBy }) =>
      patchPost(postId, { likeCount, commentCount, viewCount, shareCount, likedBy }),

    toggleLike: async (post) => {
      if (!get().posts[post.id]) get().upsertPosts([post])
      const before = get().posts[post.id]
      const liked = !before.likedByMe
      patchPost(post.id, { likedByMe: liked, likeCount: Math.max(0, before.likeCount + (liked ? 1 : -1)) })
      try {
        const result = liked ? await api.likePost(post.id) : await api.unlikePost(post.id)
        patchPost(post.id, { likedByMe: result.likedByMe, likeCount: result.likeCount })
      } catch {
        patchPost(post.id, { likedByMe: before.likedByMe, likeCount: before.likeCount })
        get().pushToast({ message: "Couldn't update your like. Try again." })
      }
    },
    toggleSave: async (post) => {
      if (!get().posts[post.id]) get().upsertPosts([post])
      const before = get().posts[post.id]
      const saved = !before.savedByMe
      patchPost(post.id, { savedByMe: saved })
      try {
        const result = saved ? await api.savePost(post.id) : await api.unsavePost(post.id)
        patchPost(post.id, { savedByMe: result.savedByMe })
      } catch {
        patchPost(post.id, { savedByMe: before.savedByMe })
        get().pushToast({ message: "Couldn't save that post. Try again." })
      }
    },

    removePost: (postId) => {
      set((s) => {
        const posts = { ...s.posts }
        delete posts[postId]
        const postLists: Record<string, PostList> = {}
        for (const [key, list] of Object.entries(s.postLists)) {
          postLists[key] = { ...list, ids: list.ids.filter((id) => id !== postId) }
        }
        return { posts, postLists, newPostIds: s.newPostIds.filter((id) => id !== postId) }
      })
    },
    noteNewPost: (post) => {
      const { me, accounts, postLists } = get()
      if (post.author.kind === 'me') {
        // My own post goes straight to the top of my feed and of my profile grid (reels also on the Reels tab).
        get().prependToPostList('feed', [post.id])
        if (me) get().prependToPostList(`profile:${me.username}:posts`, [post.id])
        if (me && post.kind === 'reel') get().prependToPostList(`profile:${me.username}:reels`, [post.id])
        return
      }
      const following = (accounts[post.author.id] ?? post.author).iFollow
      // A feed that isn't loaded yet will include the post when it loads, so only a loaded feed gets the pill.
      const feed = postLists.feed
      if (!following || !feed || feed.ids.includes(post.id)) return
      set((s) => ({ newPostIds: [post.id, ...s.newPostIds.filter((id) => id !== post.id)] }))
    },
    clearNewPosts: () => set({ newPostIds: [] }),

    setPostList: (key, posts, cursor) => {
      get().upsertPosts(posts)
      const ids = unique(posts.map((p) => p.id))
      set((s) => ({
        postLists: { ...s.postLists, [key]: { ids, cursor, done: cursor === null } },
        // A freshly loaded feed already shows the newest posts, so they no longer count as "new".
        newPostIds: key === 'feed' ? s.newPostIds.filter((id) => !ids.includes(id)) : s.newPostIds,
      }))
    },
    appendPostList: (key, posts, cursor) => {
      get().upsertPosts(posts)
      set((s) => {
        const ids = unique([...(s.postLists[key]?.ids ?? []), ...posts.map((p) => p.id)])
        return { postLists: { ...s.postLists, [key]: { ids, cursor, done: cursor === null } } }
      })
    },
    prependToPostList: (key, postIds) => {
      set((s) => {
        const list = s.postLists[key]
        return list ? { postLists: { ...s.postLists, [key]: { ...list, ids: unique([...postIds, ...list.ids]) } } } : {}
      })
    },

    setComments: (postId, comments) => set((s) => ({ comments: { ...s.comments, [postId]: comments } })),
    addComment: (comment) => {
      updateThread(comment.postId, (list) => insertComment(list, comment))
      // The feed card's preview comments are part of the cached post, so a live comment shows there right away too.
      const post = get().posts[comment.postId]
      if (post && !comment.parentId && !post.previewComments.some((c) => c.id === comment.id)) {
        patchPost(post.id, { previewComments: pickPreviews([...post.previewComments, comment]) })
      }
    },
    updateCommentStats: ({ postId, commentId, likeCount, likedByAuthor }) =>
      updateThread(postId, (list) => patchComment(list, commentId, { likeCount, likedByAuthor })),
    toggleCommentLike: async (comment) => {
      const { postId, id } = comment
      const liked = !comment.likedByMe
      updateThread(postId, (list) => patchComment(list, id, { likedByMe: liked, likeCount: Math.max(0, comment.likeCount + (liked ? 1 : -1)) }))
      try {
        const result = liked ? await api.likeComment(id) : await api.unlikeComment(id)
        updateThread(postId, (list) => patchComment(list, id, { likedByMe: result.likedByMe, likeCount: result.likeCount }))
      } catch {
        updateThread(postId, (list) => patchComment(list, id, { likedByMe: comment.likedByMe, likeCount: comment.likeCount }))
        get().pushToast({ message: "Couldn't like that comment. Try again." })
      }
    },
    setCommentPinned: (postId, commentId, pinned) => updateThread(postId, (list) => patchComment(list, commentId, { pinned })),
    deleteCommentLocal: (postId, commentId) => {
      updateThread(postId, (list) => removeComment(list, commentId))
      const post = get().posts[postId]
      if (post?.previewComments.some((c) => c.id === commentId)) {
        patchPost(postId, { previewComments: post.previewComments.filter((c) => c.id !== commentId) })
      }
    },
  }
}
