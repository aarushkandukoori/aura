import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../lib/cx'
import type { Account } from '../lib/types'
import { Avatar } from './Avatar'
import { FollowButton } from './FollowButton'
import { VerifiedBadge } from './VerifiedBadge'

interface UserRowProps {
  account: Account
  /** Second line (default: the display name). */
  subtitle?: ReactNode
  /** Show a Follow button on the right. */
  follow?: boolean
  /** Anything else on the right (replaces the Follow button), e.g. a "Remove" button or a checkbox. */
  right?: ReactNode
  /** Avatar size in px (default 44). */
  size?: number
  /** Story ring on the avatar (default on). */
  story?: boolean
  /** Make the whole row a button instead of a link to the profile (e.g. picking people for a chat). */
  onClick?: () => void
  className?: string
}

/** One person in a list: avatar, username (+ verified), a second line, and a Follow button or custom action. */
export function UserRow({ account, subtitle, follow = false, right, size = 44, story = true, onClick, className }: UserRowProps) {
  const text = (
    <span className="min-w-0 flex-1 text-left">
      <span className="flex items-center gap-1">
        <span className="truncate text-sm font-semibold">{account.username}</span>
        {account.verified && <VerifiedBadge size={13} />}
      </span>
      <span className="block truncate text-sm text-muted">{subtitle ?? account.displayName}</span>
    </span>
  )
  const side = right ?? (follow ? <FollowButton account={account} /> : null)

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx('flex w-full items-center gap-3 px-4 py-2 hover:bg-surface', className)}>
        <Avatar account={account} size={size} story={story} />
        {text}
        {side}
      </button>
    )
  }
  return (
    <div className={cx('flex items-center gap-3 px-4 py-2', className)}>
      <Avatar account={account} size={size} story={story} link />
      <Link to={`/${account.username}`} className="flex min-w-0 flex-1">
        {text}
      </Link>
      {side}
    </div>
  )
}
