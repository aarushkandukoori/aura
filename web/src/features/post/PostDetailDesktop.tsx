import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useCloseOverlay } from '../../app/navigation'
import { PostGrid } from '../../components'
import { api } from '../../lib/api'
import { cx } from '../../lib/cx'
import { timeAgoLong } from '../../lib/format'
import { useStore } from '../../lib/store'
import type { Post } from '../../lib/types'
import { ShareSheet } from '../messages'
import { CaptionRow } from './Caption'
import { CommentComposer, EmojiQuickBar } from './CommentComposer'
import { CommentThread } from './CommentThread'
import { LikesLine } from './LikesLine'
import { PostActions } from './PostActions'
import { PostHeader } from './PostHeader'
import { mediaRatio, PostMedia } from './PostMedia'
import { useCommentDraft } from './useCommentDraft'

/**
 * The desktop post view: media on the left; header, comments, actions and comment box on the right.
 * In a modal (opened from inside the app) it is sized to the screen; as a page (a direct link) it
 * sits in a bordered card with "More posts from …" underneath.
 */
export function PostDetailDesktop({ post, inModal }: { post: Post; inModal: boolean }) {
  const draft = useCommentDraft()
  const close = useCloseOverlay('/')
  const navigate = useNavigate()
  const toggleLike = useStore((s) => s.toggleLike)
  const [slide, setSlide] = useState(0)
  const [shareOpen, setShareOpen] = useState(false)
  const ratio = mediaRatio(post, 'detail')
  const afterDelete = inModal ? close : () => navigate(`/${post.author.username}`, { replace: true })

  const view = (
    // Both versions get a fixed height so the comments column always has room, even for a small square photo.
    // Modal: the screen height minus the frame's padding (2rem each side), at most 900 px. Page: at most 720 px.
    <div
      className={cx(
        'flex bg-elevated',
        inModal ? 'h-[min(calc(100dvh-4rem),900px)] max-w-[calc(100vw-128px)]' : 'h-[min(calc(100dvh-8rem),720px)] w-full',
      )}
    >
      {/* Modal: the media's width follows its shape. Page: it fills the space left of the comments (letterboxed on black). */}
      <div
        className={cx('relative h-full min-w-0 bg-black', !inModal && 'flex-1')}
        style={inModal ? { aspectRatio: String(ratio) } : undefined}
      >
        <PostMedia
          post={post}
          view="detail"
          slide={slide}
          onSlideChange={setSlide}
          onDoubleTapLike={() => {
            if (!post.likedByMe) toggleLike(post)
          }}
        />
      </div>

      {/* The column's content is absolutely placed, so a long comment list scrolls instead of growing the row. */}
      <section aria-label="Comments" className="relative w-[360px] shrink-0 border-l border-line xl:w-[420px] 2xl:w-[480px]">
        <div className="absolute inset-0 flex flex-col">
          <PostHeader post={post} variant="detail" onShare={() => setShareOpen(true)} onDeleted={afterDelete} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            <CaptionRow post={post} />
            <CommentThread post={post} draft={draft} />
          </div>
          <div className="shrink-0 border-t border-line px-4 pb-2.5">
            <PostActions post={post} onComment={() => draft.inputRef.current?.focus()} onShare={() => setShareOpen(true)} />
            <LikesLine post={post} />
            <time dateTime={new Date(post.createdAt).toISOString()} className="mt-1 block text-xs text-muted">
              {timeAgoLong(post.createdAt)}
            </time>
          </div>
          <EmojiQuickBar onPick={draft.addEmoji} className="shrink-0 border-t border-line" />
          <CommentComposer post={post} draft={draft} className="shrink-0 border-t border-line" />
        </div>
      </section>

      <ShareSheet post={post} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  )

  if (inModal) return view
  return (
    <div className="mx-auto max-w-[935px] px-5 py-8">
      <div className="overflow-hidden rounded-md border border-line">{view}</div>
      <MorePosts post={post} />
    </div>
  )
}

/** A few more of the author's posts under a directly opened post page. */
function MorePosts({ post }: { post: Post }) {
  const [posts, setPosts] = useState<Post[]>([])
  const username = post.author.username

  useEffect(() => {
    let cancelled = false
    api.profilePosts(username, 'posts')
      .then((page) => {
        if (cancelled) return
        useStore.getState().upsertPosts(page.items)
        setPosts(page.items.filter((item) => item.id !== post.id).slice(0, 6))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [username, post.id])

  if (posts.length === 0) return null
  return (
    <section className="mt-12 border-t border-line pt-10">
      <h2 className="mb-4 text-sm font-semibold text-muted">
        More posts from{' '}
        <Link to={`/${username}`} className="text-fg hover:opacity-70">
          {username}
        </Link>
      </h2>
      <PostGrid posts={posts} />
    </section>
  )
}
