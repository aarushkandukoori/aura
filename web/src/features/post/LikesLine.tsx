import { useOpenLikes } from '../../app/navigation'
import { AvatarStack, CountUp, UsernameLink } from '../../components'
import { cx } from '../../lib/cx'
import { useMe, useStore } from '../../lib/store'
import type { Account, Post } from '../../lib/types'

/**
 * "Liked by maya.chen and 1,203 others" with a small avatar stack, or "1,204 likes".
 * The count rolls up as live likes arrive; "others" opens the likes list.
 */
export function LikesLine({ post, className }: { post: Post; className?: string }) {
  const me = useMe()
  const openLikes = useOpenLikes()
  const toggleLike = useStore((s) => s.toggleLike)

  if (post.likeCount === 0) {
    return (
      <p className={cx('text-sm', className)}>
        Be the first to{' '}
        <button type="button" onClick={() => toggleLike(post)} className="font-semibold hover:opacity-70">
          like this
        </button>
      </p>
    )
  }

  // Name a friend who liked it when we know one, otherwise "you"; everyone else is "N others".
  const friend = post.likedBy && post.likedBy.kind !== 'me' ? post.likedBy : null
  if (!friend && !post.likedByMe) {
    return (
      <button type="button" onClick={() => openLikes(post.id)} className={cx('block text-sm font-semibold hover:opacity-70', className)}>
        <CountUp value={post.likeCount} /> {post.likeCount === 1 ? 'like' : 'likes'}
      </button>
    )
  }

  const faces: Account[] = [...(friend ? [friend] : []), ...(post.likedByMe ? [me] : [])]
  const others = post.likeCount - 1
  return (
    <div className={cx('flex min-w-0 items-center gap-1.5 text-sm', className)}>
      <AvatarStack accounts={faces} size={18} />
      <p className="min-w-0">
        Liked by {friend ? <UsernameLink account={friend} /> : <span className="font-semibold">you</span>}
        {others > 0 && (
          <>
            {' '}and{' '}
            <button type="button" onClick={() => openLikes(post.id)} className="font-semibold hover:opacity-70">
              <CountUp value={others} /> {others === 1 ? 'other' : 'others'}
            </button>
          </>
        )}
      </p>
    </div>
  )
}
