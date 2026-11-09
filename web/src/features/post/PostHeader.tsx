import { useState } from 'react'
import { Avatar, FollowButton, UsernameLink } from '../../components'
import { cx } from '../../lib/cx'
import { timeAgo } from '../../lib/format'
import { useAccount } from '../../lib/store'
import type { Post } from '../../lib/types'
import { PostMenu } from './PostMenu'

interface PostHeaderProps {
  post: Post
  onShare: () => void
  /** feed: the time after the name and why a suggested post is here under it. detail: the top of the post modal. */
  variant?: 'feed' | 'detail'
  onDeleted?: () => void
}

/**
 * The top of a post: avatar (its ring opens their story), username, time, location (audio for
 * reels), a Follow button for people I don't follow yet, and the ⋯ menu.
 */
export function PostHeader({ post, onShare, variant = 'feed', onDeleted }: PostHeaderProps) {
  const author = useAccount(post.author)
  // Remember whether I followed them when the post appeared, so the button can switch to
  // "Following" after a tap instead of vanishing.
  const [offerFollow] = useState(() => author.kind !== 'me' && !author.iFollow)
  // Suggested posts say why the algorithm picked them ("Because you like #coffee"), like Instagram.
  const subtitle = variant === 'feed' && post.suggested ? post.reason || 'Suggested for you' : post.kind === 'reel' ? post.audio : post.location

  return (
    <header className={cx('flex items-center gap-2.5', variant === 'feed' ? 'px-3 py-2.5 md:px-0' : 'h-[60px] shrink-0 border-b border-line px-4')}>
      <Avatar account={post.author} size={32} story link />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
          <UsernameLink account={post.author} />
          {variant === 'feed' && (
            <>
              <span aria-hidden className="text-muted">•</span>
              <time dateTime={new Date(post.createdAt).toISOString()} className="shrink-0 text-muted">
                {timeAgo(post.createdAt)}
              </time>
            </>
          )}
          {offerFollow && (
            <>
              <span aria-hidden className="text-muted">•</span>
              <FollowButton account={post.author} variant="text" />
            </>
          )}
        </div>
        {subtitle && <p className="mt-0.5 truncate text-xs">{subtitle}</p>}
      </div>
      <PostMenu post={post} onShare={onShare} detail={variant === 'detail'} onDeleted={onDeleted} />
    </header>
  )
}
