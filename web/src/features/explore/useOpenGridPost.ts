import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useOpenPost } from '../../app/navigation'
import type { Post } from '../../lib/types'

/**
 * Returns open(post) for grid tiles: reels play in the full-screen reels viewer (starting with
 * that reel), photos and carousels open the post (a modal on desktop, a page on phones).
 */
export function useOpenGridPost(): (post: Post) => void {
  const navigate = useNavigate()
  const openPost = useOpenPost()
  return useCallback(
    (post: Post) => (post.kind === 'reel' ? navigate(`/reels/${post.id}`) : openPost(post.id)),
    [navigate, openPost],
  )
}
