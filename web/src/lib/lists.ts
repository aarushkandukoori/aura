/**
 * usePostList: a paged list of posts with infinite scroll (feed, explore, profile grids, saved, tags).
 *
 * The post ids live in the store under `key`, so leaving a page and coming back shows the same
 * list instantly (and at the same scroll position) instead of loading it again.
 *
 *   const feed = usePostList('feed', (cursor) => api.feed(cursor))
 *   {feed.posts.map((post) => <PostCard key={post.id} post={post} />)}
 *   <div ref={feed.sentinelRef} />          // loads the next page as it scrolls into view
 *
 * Keys in use: 'feed', 'explore:<topic>', 'reels', 'saved', 'tag:<tag>',
 * 'profile:<username>:posts' | ':reels' | ':tagged'. My new posts are added to the top of 'feed'
 * and 'profile:<me>:posts'/'reels' automatically when they go live.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useInfiniteScroll } from './hooks'
import { useStore } from './store'
import type { Page, Post } from './types'

export type FetchPage = (cursor: string | null) => Promise<Page<Post>>

export interface PostListState {
  posts: Post[]
  /** true until the first page has arrived. */
  loading: boolean
  /** true while any page is loading. */
  loadingMore: boolean
  error: string | null
  /** true when there are no more pages. */
  done: boolean
  loadMore: () => void
  /** Load page one again (pull to refresh, "New posts" pill). */
  refresh: () => Promise<void>
  /** Put this ref on an element after the last post. */
  sentinelRef: (node: Element | null) => void
}

export function usePostList(key: string, fetchPage: FetchPage): PostListState {
  const list = useStore((s) => s.postLists[key])
  const posts = useStore(useShallow((s) => (s.postLists[key]?.ids ?? []).flatMap((id) => (s.posts[id] ? [s.posts[id]] : []))))
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)

  // Keep the latest fetch function without making callers memoize it.
  const fetchRef = useRef(fetchPage)
  useEffect(() => {
    fetchRef.current = fetchPage
  })
  const inFlight = useRef<string | null>(null)

  const load = useCallback(async (fresh: boolean) => {
    const current = useStore.getState().postLists[key]
    if (inFlight.current === key || (!fresh && (!current || current.done))) return
    inFlight.current = key
    setLoadingKey(key)
    setError(null)
    try {
      const page = await fetchRef.current(fresh ? null : current?.cursor ?? null)
      const store = useStore.getState()
      if (fresh) store.setPostList(key, page.items, page.nextCursor)
      else store.appendPostList(key, page.items, page.nextCursor)
    } catch (cause) {
      setError({ key, message: cause instanceof Error ? cause.message : 'Something went wrong' })
    } finally {
      if (inFlight.current === key) inFlight.current = null
      setLoadingKey((k) => (k === key ? null : k))
    }
  }, [key])

  // First visit loads page one; coming back shows the cached list straight away.
  useEffect(() => {
    if (!useStore.getState().postLists[key]) load(true)
  }, [key, load])

  const loadingMore = loadingKey === key
  const errorMessage = error?.key === key ? error.message : null
  const loadMore = useCallback(() => {
    load(false)
  }, [load])
  const refresh = useCallback(() => load(true), [load])
  const sentinelRef = useInfiniteScroll(loadMore, Boolean(list) && !list?.done && !loadingMore && !errorMessage)

  return {
    posts,
    loading: !list && !errorMessage,
    loadingMore,
    error: errorMessage,
    done: list?.done ?? false,
    loadMore,
    refresh,
    sentinelRef,
  }
}
