import { Clapperboard, Copy, Heart, MessageCircle, Play } from 'lucide-react'
import { useOpenPost } from '../app/navigation'
import { cx } from '../lib/cx'
import { formatCount } from '../lib/format'
import { usePost } from '../lib/store'
import type { Post } from '../lib/types'
import { Img } from './Img'

interface PostGridProps {
  posts: Post[]
  /** Show view counts on reels (the profile Reels tab). */
  showViews?: boolean
  /** What a click does (default: open the post as a modal on desktop, a page on phones). */
  onOpen?: (post: Post) => void
  className?: string
}

/** The 3-column grid of square thumbnails used on profiles, saved, tags. */
export function PostGrid({ posts, showViews = false, onOpen, className }: PostGridProps) {
  const openPost = useOpenPost()
  return (
    <div className={cx('grid grid-cols-3 gap-0.5 md:gap-1', className)}>
      {posts.map((post) => (
        <GridTile key={post.id} post={post} showViews={showViews} onOpen={() => (onOpen ? onOpen(post) : openPost(post.id))} />
      ))}
    </div>
  )
}

/** The picture to show for a post in a grid (a video's poster frame, or the first image). */
export function postThumbnail(post: Post): string | null {
  const first = post.media[0]
  if (!first) return null
  return first.type === 'video' ? first.poster ?? null : first.url
}

function GridTile({ post: initial, showViews, onOpen }: { post: Post; showViews: boolean; onOpen: () => void }) {
  const post = usePost(initial.id) ?? initial // live counts
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open post by ${post.author.username}`}
      className="group relative aspect-square overflow-hidden bg-surface outline-offset-[-2px]"
    >
      <Img src={postThumbnail(post)} alt={post.caption || `Post by ${post.author.username}`} className="size-full" />

      {post.kind !== 'photo' && (
        <span className="absolute right-2 top-2 text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.5)]">
          {post.kind === 'reel' ? <Clapperboard size={18} strokeWidth={2} /> : <Copy size={18} strokeWidth={2} className="-scale-x-100" />}
        </span>
      )}

      {showViews && post.kind === 'reel' && (
        <span className="absolute bottom-2 left-2 flex items-center gap-1 text-[13px] font-semibold text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)]">
          <Play size={14} fill="currentColor" />
          {formatCount(post.viewCount)}
        </span>
      )}

      {/* Desktop hover: likes and comments. */}
      <span className="absolute inset-0 hidden items-center justify-center gap-6 bg-black/35 text-[15px] font-bold text-white group-hover:flex group-focus-visible:flex">
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
