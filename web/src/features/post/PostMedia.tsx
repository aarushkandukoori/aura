import { useState } from 'react'
import { useNavigate } from 'react-router'
import { HeartBurst } from '../../components'
import { cx } from '../../lib/cx'
import { useDoubleTap } from '../../lib/hooks'
import type { Post } from '../../lib/types'
import { Carousel, CarouselDots } from './Carousel'
import { MediaItem } from './MediaItem'
import { ReelPreview } from './ReelPreview'
import { TaggedPeople } from './TaggedPeople'

/** feed = inside a post card (fixed shape, cropped); detail = the post modal / page (whole picture on black). */
export type MediaView = 'feed' | 'detail'

/**
 * Width / height of a post's media box. Feed photos keep their own shape between 4:5 (tall)
 * and 1.91:1 (wide), and reels are cropped to 4:5. The detail view allows tall 9:16 pictures.
 */
export function mediaRatio(post: Post, view: MediaView): number {
  if (view === 'feed' && post.kind === 'reel') return 4 / 5
  const first = post.media[0]
  const natural = first?.width && first.height ? first.width / first.height : 4 / 5
  const tallest = view === 'feed' ? 4 / 5 : 9 / 16
  return Math.min(1.91, Math.max(tallest, natural))
}

/** Words for screen readers, since the pictures have no descriptions of their own. */
export function mediaAlt(post: Post): string {
  const what = post.kind === 'reel' ? 'Reel' : 'Photo'
  return post.caption ? `${what} by ${post.author.username}: ${post.caption.slice(0, 100)}` : `${what} by ${post.author.username}`
}

interface PostMediaProps {
  post: Post
  view: MediaView
  slide: number
  onSlideChange: (index: number) => void
  /** Double tap / double click likes the post (it never unlikes); the heart pops either way. */
  onDoubleTapLike: () => void
  className?: string
}

/**
 * The photo, carousel, video or reel of a post. Double tap to like (with the big heart);
 * a single tap on a reel opens it in the Reels viewer.
 */
export function PostMedia({ post, view, slide, onSlideChange, onDoubleTapLike, className }: PostMediaProps) {
  const navigate = useNavigate()
  const [burst, setBurst] = useState(0)
  const isReel = post.kind === 'reel'
  const isCarousel = !isReel && post.media.length > 1
  const fit = view === 'detail' ? 'contain' : 'cover'

  const onTap = useDoubleTap(
    () => {
      onDoubleTapLike()
      setBurst((n) => n + 1)
    },
    isReel ? () => navigate(`/reels/${post.id}`) : undefined,
  )

  return (
    <div
      onClick={onTap}
      className={cx(
        'relative select-none overflow-hidden',
        view === 'detail' ? 'size-full bg-black' : 'w-full bg-surface md:rounded-[4px] md:border md:border-line',
        isReel && 'cursor-pointer',
        className,
      )}
      style={view === 'feed' ? { aspectRatio: String(mediaRatio(post, 'feed')) } : undefined}
    >
      {isReel ? (
        <ReelPreview post={post} fit={fit} />
      ) : isCarousel ? (
        <Carousel media={post.media} index={slide} onIndexChange={onSlideChange} fit={fit} alt={mediaAlt(post)} />
      ) : post.media[0] ? (
        <MediaItem media={post.media[0]} fit={fit} alt={mediaAlt(post)} />
      ) : null}

      {/* In the detail view the dots sit on the picture; the feed card draws them under it. */}
      {view === 'detail' && isCarousel && (
        <CarouselDots count={post.media.length} index={slide} onMedia className="pointer-events-none absolute inset-x-0 bottom-4 justify-center" />
      )}
      {post.tagged.length > 0 && !isReel && <TaggedPeople accounts={post.tagged} />}
      <HeartBurst trigger={burst} />
    </div>
  )
}
