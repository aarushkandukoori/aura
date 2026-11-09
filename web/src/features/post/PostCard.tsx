import { useState } from 'react'
import { useOpenPost } from '../../app/navigation'
import { CountUp } from '../../components'
import { timeAgoLong } from '../../lib/format'
import { useIsMobile } from '../../lib/hooks'
import { usePost, useStore } from '../../lib/store'
import { trackOpen, useImpression } from '../../lib/track'
import type { Comment, Post } from '../../lib/types'
import { ShareSheet } from '../messages'
import { Caption, PreviewComments } from './Caption'
import { CarouselDots } from './Carousel'
import { CommentComposer } from './CommentComposer'
import { CommentsSheet } from './CommentsSheet'
import { LikesLine } from './LikesLine'
import { PostActions } from './PostActions'
import { PostHeader } from './PostHeader'
import { PostMedia } from './PostMedia'
import { useCommentDraft } from './useCommentDraft'

interface PostCardProps {
  post: Post
  /** feed (default): preview comments, "View all", comment box. page: the phone post page, which lists the comments below. */
  variant?: 'feed' | 'page'
  /** What the comment icon does (the post page focuses its comment box). */
  onComment?: () => void
  onDeleted?: () => void
}

/**
 * One post in the feed: header, media (double tap to like), actions, "Liked by…", caption,
 * preview comments and, on desktop, a comment box. It reads the live copy of the post from the
 * store, so likes and comments tick up while you look at it.
 */
export function PostCard({ post: initial, variant = 'feed', onComment, onDeleted }: PostCardProps) {
  const post = usePost(initial.id) ?? initial
  const isMobile = useIsMobile()
  const openPost = useOpenPost()
  const toggleLike = useStore((s) => s.toggleLike)
  const draft = useCommentDraft()
  const [slide, setSlide] = useState(0)
  const [shareOpen, setShareOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  // Comments I post from this card show under it right away.
  const [myComments, setMyComments] = useState<Comment[]>([])
  const inFeed = variant === 'feed'
  // Tells the recommendation algorithm how long this post stayed on screen in the feed.
  const impressionRef = useImpression(inFeed ? post.id : null)

  const openComments = onComment ?? (() => (isMobile ? setCommentsOpen(true) : openPost(post.id)))
  const showComments = () => {
    if (inFeed) trackOpen(post.id)
    openComments()
  }
  const previews = [...post.previewComments, ...myComments.filter((mine) => !post.previewComments.some((c) => c.id === mine.id))]
  const isCarousel = post.kind !== 'reel' && post.media.length > 1

  return (
    <article ref={impressionRef} aria-label={`Post by ${post.author.username}`} className="pb-4 md:mb-5 md:border-b md:border-line md:pb-5">
      <PostHeader post={post} onShare={() => setShareOpen(true)} onDeleted={onDeleted} />
      <PostMedia
        post={post}
        view="feed"
        slide={slide}
        onSlideChange={setSlide}
        onDoubleTapLike={() => {
          if (!post.likedByMe) toggleLike(post)
        }}
      />

      <div className="px-3 md:px-0">
        <PostActions
          post={post}
          onComment={showComments}
          onShare={() => setShareOpen(true)}
          center={isCarousel ? <CarouselDots count={post.media.length} index={slide} /> : null}
        />
        <LikesLine post={post} />
        <div className="mt-1.5 space-y-1">
          <Caption post={post} />
          {inFeed && post.commentCount > previews.length && (
            <button type="button" onClick={showComments} className="block text-sm text-muted hover:text-fg">
              {post.commentCount === 1 ? 'View 1 comment' : <>View all <CountUp value={post.commentCount} /> comments</>}
            </button>
          )}
          {inFeed && <PreviewComments comments={previews} onOpen={showComments} />}
        </div>
        {!inFeed && <time className="mt-2 block text-xs text-muted">{timeAgoLong(post.createdAt)}</time>}
        {inFeed && !isMobile && (
          <CommentComposer post={post} draft={draft} compact onPosted={(comment) => setMyComments((list) => [...list, comment])} />
        )}
      </div>

      <ShareSheet post={post} open={shareOpen} onClose={() => setShareOpen(false)} />
      {inFeed && isMobile && <CommentsSheet post={post} open={commentsOpen} onClose={() => setCommentsOpen(false)} />}
    </article>
  )
}
