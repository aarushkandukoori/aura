import { Clapperboard, Copy, Heart, MessageCircle, Play } from 'lucide-react'
import { Img, postThumbnail } from '../../components'
import { cx } from '../../lib/cx'
import { formatCount } from '../../lib/format'
import { usePost } from '../../lib/store'
import type { Post } from '../../lib/types'
import { useOpenGridPost } from './useOpenGridPost'

interface ExploreTileProps {
  post: Post
  /** The tall tile of a block: reels show their view count here. */
  tall?: boolean
  /** Grid placement classes (the tall tile is placed explicitly). */
  className?: string
}

/** One picture in the explore grid: thumbnail, a reel/carousel icon, and likes + comments on hover. */
export function ExploreTile({ post: initial, tall = false, className }: ExploreTileProps) {
  const post = usePost(initial.id) ?? initial // live counts
  const open = useOpenGridPost()
  const kindLabel = post.kind === 'reel' ? 'reel' : 'post'

  return (
    <button
      type="button"
      onClick={() => open(post)}
      aria-label={`Open ${kindLabel} by ${post.author.username}`}
      className={cx('group relative size-full overflow-hidden bg-surface outline-offset-[-2px]', className)}
    >
      <Img src={postThumbnail(post)} alt={post.caption || `${kindLabel} by ${post.author.username}`} className="size-full" />

      {post.kind !== 'photo' && (
        <span className="absolute right-2 top-2 text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.5)]">
          {post.kind === 'reel' ? <Clapperboard size={18} strokeWidth={2} /> : <Copy size={18} strokeWidth={2} className="-scale-x-100" />}
        </span>
      )}

      {tall && post.kind === 'reel' && (
        // A soft shade under the view count keeps it readable on bright pictures.
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-linear-to-t from-black/45 to-transparent px-2.5 pb-2.5 pt-8 text-[13px] font-semibold text-white">
          <Play size={14} fill="currentColor" />
          {formatCount(post.viewCount)}
        </span>
      )}

      {/* Desktop hover: likes and comments. */}
      <span className="absolute inset-0 hidden items-center justify-center gap-6 bg-black/35 text-[15px] font-bold text-white md:group-hover:flex md:group-focus-visible:flex">
        <span className="flex items-center gap-1.5">
          <Heart size={19} fill="currentColor" />
          {formatCount(post.likeCount)}
        </span>
        <span className="flex items-center gap-1.5">
          <MessageCircle size={19} fill="currentColor" className="-scale-x-100" />
          {formatCount(post.commentCount)}
        </span>
      </span>
    </button>
  )
}
