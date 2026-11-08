/**
 * Explore (SPEC screen 10): topic chips ("For you" + my interests) over a grid of posts from
 * everyone, with a tall tile in every third row. Phones also get a search bar that opens /search.
 */
import { Compass, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Button, EmptyState, LoadingBlock } from '../../components'
import { api } from '../../lib/api'
import { usePostList } from '../../lib/lists'
import { useMe } from '../../lib/store'
import { ExploreGrid, ExploreGridSkeleton } from './ExploreGrid'
import { TopicChips } from './TopicChips'

export function ExplorePage() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  // The topic lives in the URL (?topic=music), so Back from a post returns to the same list.
  const topic = params.get('topic')
  const list = usePostList(`explore:${topic ?? 'for-you'}`, (cursor) => api.explore(cursor, topic))

  function chooseTopic(next: string | null) {
    setParams(next ? { topic: next } : {}, { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-[975px] pb-6 md:px-5 md:pt-6 lg:pt-9">
      <div className="sticky top-0 z-20 bg-bg/95 pt-safe backdrop-blur-xl md:static md:bg-transparent md:pt-0 md:backdrop-blur-none">
        <Link
          to="/search"
          className="mx-4 mt-2 flex h-10 items-center gap-2.5 rounded-xl bg-surface px-3.5 text-[15px] text-muted md:hidden"
        >
          <Search size={18} strokeWidth={2} />
          Search
        </Link>
        <TopicChips interests={me.interests} value={topic} onChange={chooseTopic} />
      </div>

      {list.loading ? (
        <ExploreGridSkeleton />
      ) : list.error && list.posts.length === 0 ? (
        <EmptyState
          title="Couldn't load Explore"
          body={list.error}
          action={<Button onClick={() => list.refresh()}>Try again</Button>}
        />
      ) : list.posts.length === 0 ? (
        <EmptyState
          icon={<Compass size={30} strokeWidth={1.5} />}
          title="Nothing here yet"
          body="New posts about this show up here as people share them."
          action={<Button variant="secondary" onClick={() => chooseTopic(null)}>Back to For you</Button>}
        />
      ) : (
        <ExploreGrid posts={list.posts} done={list.done} />
      )}

      <div ref={list.sentinelRef} />
      {list.loadingMore && !list.loading && <LoadingBlock />}
      {list.error && list.posts.length > 0 && (
        <div className="flex justify-center py-6">
          <Button variant="secondary" onClick={list.loadMore}>Load more</Button>
        </div>
      )}
    </div>
  )
}
