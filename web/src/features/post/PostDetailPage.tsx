import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useInModal } from '../../app/navigation'
import { LoadingBlock, NotFound } from '../../components'
import { api, ApiError } from '../../lib/api'
import { useIsMobile } from '../../lib/hooks'
import { usePost, useStore } from '../../lib/store'
import type { ID, Post } from '../../lib/types'
import { PostDetailDesktop } from './PostDetailDesktop'
import { PostDetailMobile } from './PostDetailMobile'

/**
 * /p/:id - one post with all its comments. Desktop: a two-column modal over the page you came
 * from (or a page of its own for a direct link). Phones: a full page.
 */
export function PostDetailPage() {
  const { id = '' } = useParams()
  const inModal = useInModal()
  const isMobile = useIsMobile()
  const { post, missing } = usePostById(id)

  if (missing) {
    return (
      <div className={inModal ? 'w-[min(560px,calc(100vw-32px))]' : undefined}>
        <NotFound title="This post isn't available." />
      </div>
    )
  }
  if (!post) {
    return inModal ? (
      <div className="grid h-[min(calc(100dvh-4rem),900px)] w-[min(1100px,calc(100vw-128px))] place-items-center">
        <LoadingBlock />
      </div>
    ) : (
      <LoadingBlock className="py-24" />
    )
  }
  return isMobile ? <PostDetailMobile post={post} /> : <PostDetailDesktop post={post} inModal={inModal} />
}

/**
 * The post from the store (shows at once when the feed already has it, and stays live), refreshed
 * from the server. `missing` once the server says it doesn't exist (or it was deleted meanwhile).
 */
function usePostById(id: ID): { post: Post | undefined; missing: boolean } {
  const post = usePost(id)
  // Which id the last answer was for, so a new id starts out "loading" again.
  const [answeredId, setAnsweredId] = useState<ID | null>(null)

  useEffect(() => {
    let cancelled = false
    api.post(id)
      .then((fresh) => {
        if (!cancelled) useStore.getState().upsertPosts([fresh])
      })
      .catch((error) => {
        if (!cancelled && error instanceof ApiError && error.status === 404) useStore.getState().removePost(id)
      })
      .finally(() => {
        if (!cancelled) setAnsweredId(id)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return { post, missing: !post && answeredId === id }
}
