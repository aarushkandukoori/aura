/**
 * The column of buttons beside a reel: like, comment, share, save and more.
 * On phones it floats over the right edge of the video (white icons); on desktop it stands next
 * to the video in the page's own colors.
 */
import { Bookmark, MessageCircle, Send } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { CountUp, IconButton, Img, LikeButton } from '../../components'
import { cx } from '../../lib/cx'
import { formatCount } from '../../lib/format'
import { useStore } from '../../lib/store'
import type { Post } from '../../lib/types'
import { ShareSheet } from '../messages'
import { ReelMenu } from './ReelMenu'

interface ReelActionsProps {
  post: Post
  /** overlay = on top of the video (phones), side = next to it (desktop). */
  layout: 'overlay' | 'side'
  onComments: () => void
}

export function ReelActions({ post, layout, onComments }: ReelActionsProps) {
  const toggleLike = useStore((s) => s.toggleLike)
  const toggleSave = useStore((s) => s.toggleSave)
  const [sharing, setSharing] = useState(false)

  return (
    <div
      className={cx(
        'flex flex-col items-center gap-3.5',
        layout === 'overlay' ? 'text-white [&_svg]:drop-shadow-[0_1px_3px_rgb(0_0_0/0.45)]' : 'text-fg',
      )}
    >
      <Action count={post.likeCount}>
        <LikeButton liked={post.likedByMe} onToggle={() => toggleLike(post)} size={28} className="size-11" />
      </Action>
      <Action count={post.commentCount}>
        <IconButton label="Comments" size="lg" onClick={onComments}>
          <MessageCircle size={28} strokeWidth={1.9} className="-scale-x-100" />
        </IconButton>
      </Action>
      <Action count={post.shareCount}>
        <IconButton label="Share" size="lg" onClick={() => setSharing(true)}>
          <Send size={26} strokeWidth={1.9} />
        </IconButton>
      </Action>
      <IconButton label={post.savedByMe ? 'Remove from saved' : 'Save'} size="lg" onClick={() => toggleSave(post)}>
        <Bookmark size={26} strokeWidth={1.9} fill={post.savedByMe ? 'currentColor' : 'none'} />
      </IconButton>
      <ReelMenu post={post} />
      {/* The "audio" cover: the creator's picture, like an album sleeve. */}
      <span aria-hidden className="mt-1 block rounded-md border-2 border-current p-px">
        <Img src={post.author.avatar} alt="" className="size-[26px] rounded-[4px]" />
      </span>

      <ShareSheet post={post} open={sharing} onClose={() => setSharing(false)} />
    </div>
  )
}

/** A button with its count underneath (counts roll when they change live). Zero shows no number. */
function Action({ count, children }: { count: number; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      {children}
      <span className="-mt-0.5 min-h-4 text-[13px] font-semibold leading-4">
        {count > 0 && <CountUp value={count} format={formatCount} />}
      </span>
    </div>
  )
}
