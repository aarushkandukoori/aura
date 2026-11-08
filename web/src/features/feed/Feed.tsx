import { Fragment } from 'react'
import { LoadingBlock } from '../../components'
import { api } from '../../lib/api'
import { useIsMobile } from '../../lib/hooks'
import { usePostList } from '../../lib/lists'
import { useStore } from '../../lib/store'
import type { Post } from '../../lib/types'
import { PostCard } from '../post'
import { StoriesTray } from '../stories'
import { refreshTrays } from '../stories/StoriesTray'
import { CaughtUp, EmptyFeed, FeedError, FeedSkeleton, PullIndicator } from './FeedStates'
import { NewPostsPill } from './NewPostsPill'
import { usePullToRefresh } from './usePullToRefresh'

/**
 * The home feed column: stories tray, posts from me and people I follow (newest first) with a
 * suggested post now and then, endless scrolling, the "New posts" pill, and "You're all caught up"
 * where the posts from people I follow end. Pull down to refresh on phones.
 */
export function Feed() {
  const isMobile = useIsMobile()
  const feed = usePostList('feed', (cursor) => api.feed(cursor))

  async function refresh() {
    useStore.getState().clearNewPosts() // the fresh first page already includes them
    await Promise.all([feed.refresh(), refreshTrays().catch(() => {})])
  }
  const pull = usePullToRefresh(refresh, isMobile)
  const caughtUpAt = caughtUpIndex(feed.posts, feed.done)

  return (
    <>
      <PullIndicator distance={pull.distance} pulling={pull.pulling} refreshing={pull.refreshing} />
      <StoriesTray />
      <NewPostsPill />

      {feed.loading ? (
        <FeedSkeleton />
      ) : feed.posts.length === 0 ? (
        feed.error ? <FeedError onRetry={feed.refresh} /> : <EmptyFeed />
      ) : (
        <div>
          {feed.posts.map((post, index) => (
            <Fragment key={post.id}>
              <PostCard post={post} />
              {index === caughtUpAt && <CaughtUp since={post.createdAt} moreBelow={index < feed.posts.length - 1 || !feed.done} />}
            </Fragment>
          ))}
          <div ref={feed.sentinelRef} />
          {feed.loadingMore && <LoadingBlock />}
          {feed.error && <FeedError compact onRetry={feed.loadMore} />}
        </div>
      )}
    </>
  )
}

/**
 * Where the posts from people I follow run out: the index of the last one, once we know nothing
 * from them comes after it. The server mixes in one suggested post per six, so two suggested posts
 * in a row after it (or the end of the feed) means they really are finished. -1 = not reached yet.
 */
function caughtUpIndex(posts: Post[], done: boolean): number {
  let last = -1
  posts.forEach((post, index) => {
    if (!post.suggested) last = index
  })
  if (last === -1) return -1
  const suggestedAfter = posts.length - 1 - last
  return done || suggestedAfter >= 2 ? last : -1
}
