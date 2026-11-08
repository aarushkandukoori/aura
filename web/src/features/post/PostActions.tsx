import { Bookmark, MessageCircle, Send } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { IconButton, LikeButton } from '../../components'
import { cx } from '../../lib/cx'
import { useStore } from '../../lib/store'
import type { Post } from '../../lib/types'

interface PostActionsProps {
  post: Post
  onComment: () => void
  onShare: () => void
  /** Drawn in the middle of the row (the carousel dots in the feed). */
  center?: ReactNode
  className?: string
}

/** Like, comment, share and save. Like and save update at once and sync with the server. */
export function PostActions({ post, onComment, onShare, center, className }: PostActionsProps) {
  const toggleLike = useStore((s) => s.toggleLike)
  const toggleSave = useStore((s) => s.toggleSave)
  // Bumped on each save tap so the bookmark pops (not when a post simply shows up already saved).
  const [savePop, setSavePop] = useState(0)

  return (
    <div className={cx('relative flex h-11 items-center', className)}>
      <div className="-ml-2 flex items-center">
        <LikeButton liked={post.likedByMe} onToggle={() => toggleLike(post)} className="size-10" />
        <IconButton label="Comment" onClick={onComment}>
          <MessageCircle size={24} strokeWidth={1.9} className="-scale-x-100" />
        </IconButton>
        <IconButton label="Share" onClick={onShare}>
          <Send size={23} strokeWidth={1.9} />
        </IconButton>
      </div>

      {center && <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">{center}</div>}

      <IconButton
        label={post.savedByMe ? 'Remove from saved' : 'Save'}
        aria-pressed={post.savedByMe}
        className="-mr-2 ml-auto"
        onClick={() => {
          if (!post.savedByMe) setSavePop((n) => n + 1)
          toggleSave(post)
        }}
      >
        <span key={savePop} className={cx('grid', savePop > 0 && post.savedByMe && 'animate-pop')}>
          <Bookmark size={24} strokeWidth={1.9} fill={post.savedByMe ? 'currentColor' : 'none'} />
        </span>
      </IconButton>
    </div>
  )
}
