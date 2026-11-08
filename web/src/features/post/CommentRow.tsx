import { Ellipsis, Heart, Pin } from 'lucide-react'
import { Avatar, CountUp, LikeButton, LinkifiedText, Menu, toast, UsernameLink, type MenuItem } from '../../components'
import { api } from '../../lib/api'
import { formatCount, timeAgo } from '../../lib/format'
import { useStore } from '../../lib/store'
import type { Account, Comment, Post } from '../../lib/types'

interface CommentRowProps {
  comment: Comment
  post: Post
  onReply: () => void
  /** Replies use a smaller avatar. */
  small?: boolean
}

/**
 * One comment: avatar, "username text", then time · likes · Reply, the post author's heart when
 * they liked it, and a ⋯ menu (pin / delete) when I'm allowed to use one. The heart on the right
 * likes the comment.
 */
export function CommentRow({ comment, post, onReply, small = false }: CommentRowProps) {
  const toggleCommentLike = useStore((s) => s.toggleCommentLike)
  // On my own post my filled heart already says I liked it, so the "liked by author" mark would repeat it.
  const showAuthorHeart = comment.likedByAuthor && post.author.kind !== 'me'

  return (
    <div className="group flex gap-3 py-2">
      <Avatar account={comment.author} size={small ? 24 : 32} story link />
      <div className="min-w-0 flex-1 pt-0.5">
        {comment.pinned && (
          <p className="mb-0.5 flex items-center gap-1 text-xs text-muted">
            <Pin size={11} /> Pinned
          </p>
        )}
        <p className="break-words text-sm leading-snug">
          <UsernameLink account={comment.author} /> <LinkifiedText text={comment.text} />
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <time dateTime={new Date(comment.createdAt).toISOString()}>{timeAgo(comment.createdAt)}</time>
          {comment.likeCount > 0 && (
            <span className="font-semibold">
              <CountUp value={comment.likeCount} format={formatCount} /> {comment.likeCount === 1 ? 'like' : 'likes'}
            </span>
          )}
          <button type="button" onClick={onReply} className="font-semibold hover:text-fg">
            Reply
          </button>
          {showAuthorHeart && <AuthorHeart author={post.author} />}
          <CommentMenu comment={comment} post={post} />
        </div>
      </div>
      <LikeButton liked={comment.likedByMe} onToggle={() => toggleCommentLike(comment)} size={13} className="mt-1.5 size-7 text-muted" />
    </div>
  )
}

/** The post author's avatar with a tiny heart: they liked this comment. */
function AuthorHeart({ author }: { author: Account }) {
  return (
    <span className="relative inline-flex" title={`Liked by ${author.username}`}>
      <Avatar account={author} size={14} />
      <Heart size={9} fill="var(--like)" color="var(--like)" className="absolute -bottom-0.5 -right-1" aria-hidden />
      <span className="sr-only">Liked by {author.username}</span>
    </span>
  )
}

/** Pin (my posts, top-level comments) and delete (my comments, or anything on my post). */
function CommentMenu({ comment, post }: { comment: Comment; post: Post }) {
  const isMyPost = post.author.kind === 'me'
  const items: MenuItem[] = []
  if (isMyPost && !comment.parentId) {
    items.push({ label: comment.pinned ? 'Unpin' : 'Pin comment', onSelect: () => togglePin(comment) })
  }
  if (isMyPost || comment.author.kind === 'me') {
    items.push({ label: 'Delete', danger: true, onSelect: () => deleteComment(comment) })
  }
  if (items.length === 0) return null
  return (
    <Menu
      items={items}
      label="Comment options"
      trigger={<Ellipsis size={16} />}
      className="-my-3 text-muted md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
    />
  )
}

async function togglePin(comment: Comment) {
  try {
    const { pinned } = await api.pinComment(comment.id)
    useStore.getState().setCommentPinned(comment.postId, comment.id, pinned)
    toast(pinned ? 'Comment pinned' : 'Comment unpinned')
  } catch (error) {
    toast(error instanceof Error ? error.message : "Couldn't pin that comment")
  }
}

async function deleteComment(comment: Comment) {
  try {
    await api.deleteComment(comment.id)
    useStore.getState().deleteCommentLocal(comment.postId, comment.id)
    toast('Comment deleted')
  } catch (error) {
    toast(error instanceof Error ? error.message : "Couldn't delete that comment")
  }
}
