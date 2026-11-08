import { Heart, MessageCircle, Play } from 'lucide-react'
import { useOpenPost } from '../../app/navigation'
import { Img, postThumbnail } from '../../components'
import { formatCount } from '../../lib/format'
import { usePost } from '../../lib/store'
import type { Post } from '../../lib/types'

/** The Reels tab: tall tiles with view counts (likes and comments on hover). */
export function ReelGrid({ posts }: { posts: Post[] }) {
  return (
    <div className="grid grid-cols-3 gap-0.5 md:gap-1">
      {posts.map((post) => (
        <ReelTile key={post.id} post={post} />
      ))}
    </div>
  )
}

function ReelTile({ post: initial }: { post: Post }) {
  const post = usePost(initial.id) ?? initial // live counts
  const openPost = useOpenPost()
  return (
    <button
      type="button"
      onClick={() => openPost(post.id)}
      aria-label={`Open reel by ${post.author.username}`}
      className="group relative aspect-[2/3] overflow-hidden bg-surface outline-offset-[-2px]"
    >
      <Img src={postThumbnail(post)} alt={post.caption || `Reel by ${post.author.username}`} className="size-full" />
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-black/45 to-transparent" />
      <span className="absolute bottom-2 left-2 flex items-center gap-1 text-[13px] font-semibold text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)]">
        <Play size={14} fill="currentColor" />
        {formatCount(post.viewCount)}
      </span>
      <span className="absolute inset-0 hidden items-center justify-center gap-5 bg-black/35 text-[15px] font-bold text-white group-hover:flex group-focus-visible:flex">
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
