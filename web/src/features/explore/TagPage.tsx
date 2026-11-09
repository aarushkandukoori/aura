/**
 * A hashtag page (/explore/tags/:tag): the tag with its post count, then every post that uses it,
 * newest first, in a 3-column grid with infinite scroll.
 */
import { Hash } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Button, EmptyState, LoadingBlock, PageHeader, PostGrid } from '../../components'
import { api } from '../../lib/api'
import { formatNumber } from '../../lib/format'
import { usePostList } from '../../lib/lists'
import { useTagView } from '../../lib/track'
import { useOpenGridPost } from './useOpenGridPost'

export function TagPage() {
  const { tag: rawTag = '' } = useParams()
  const tag = rawTag.replace(/^#/, '').toLowerCase()
  const list = usePostList(`tag:${tag}`, (cursor) => api.tag(tag, cursor))
  const openGridPost = useOpenGridPost()
  const total = useTagTotal(tag)
  useTagView(tag)
  // The search index knows the full count; until it answers, a finished list can count itself.
  const count = total ?? (list.done ? list.posts.length : null)

  return (
    <div className="mx-auto w-full max-w-[935px] pb-6 md:px-5">
      <PageHeader title={`#${tag}`} back="/explore" className="md:hidden" />

      <header className="flex items-center gap-5 px-4 py-6 md:gap-14 md:px-12 md:py-11">
        {/* A big # inside an aura-colored ring. */}
        <div className="aura-gradient size-[86px] shrink-0 rounded-full p-[3px] md:size-[152px] md:p-1">
          <div className="grid size-full place-items-center rounded-full bg-bg">
            <Hash className="size-9 md:size-16" strokeWidth={1.5} />
          </div>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold md:text-3xl md:font-semibold">#{tag}</h1>
          <p className="mt-1 text-sm text-muted md:mt-3 md:text-base">
            {count === null ? (
              <span className="shimmer inline-block h-4 w-20 rounded align-middle" />
            ) : (
              <>
                <span className="font-semibold text-fg">{formatNumber(count)}</span> {count === 1 ? 'post' : 'posts'}
              </>
            )}
          </p>
        </div>
      </header>

      <h2 className="px-4 pb-3 text-sm font-semibold text-muted md:px-0">Recent posts</h2>
      {list.loading ? (
        <GridSkeleton />
      ) : list.error && list.posts.length === 0 ? (
        <EmptyState title="Couldn't load these posts" body={list.error} action={<Button onClick={() => list.refresh()}>Try again</Button>} />
      ) : list.posts.length === 0 ? (
        <EmptyState
          icon={<Hash size={30} strokeWidth={1.5} />}
          title="No posts yet"
          body={`Posts tagged #${tag} will show up here.`}
        />
      ) : (
        <PostGrid posts={list.posts} showViews onOpen={openGridPost} />
      )}

      <div ref={list.sentinelRef} />
      {list.loadingMore && !list.loading && <LoadingBlock />}
    </div>
  )
}

/** The tag's total post count, from search (which counts every post that uses the tag). */
function useTagTotal(tag: string): number | null {
  const [found, setFound] = useState<{ tag: string; count: number | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .search(`#${tag}`)
      .then((result) => {
        const match = result.tags.find((item) => item.tag === tag)
        if (!cancelled) setFound({ tag, count: match?.postCount ?? null })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tag])
  return found?.tag === tag ? found.count : null
}

function GridSkeleton() {
  return (
    <div aria-label="Loading posts" className="grid grid-cols-3 gap-0.5 md:gap-1">
      {Array.from({ length: 9 }, (_, index) => (
        <div key={index} className="shimmer aspect-square" />
      ))}
    </div>
  )
}
