import { useState } from 'react'
import { cx } from '../lib/cx'
import { useAccount, useStore } from '../lib/store'
import type { Account } from '../lib/types'
import { Avatar } from './Avatar'
import { Button, type ButtonSize } from './Button'
import { ConfirmDialog } from './ConfirmDialog'

interface FollowButtonProps {
  account: Account
  size?: ButtonSize
  /** button = filled button; text = a small "Follow" link (post headers, suggestions). */
  variant?: 'button' | 'text'
  block?: boolean
  className?: string
}

/**
 * Follow / Follow back / Following, kept in sync everywhere through the store.
 * Following happens at once (optimistic); unfollowing asks first. Renders nothing for my own account.
 */
export function FollowButton({ account, size = 'sm', variant = 'button', block, className }: FollowButtonProps) {
  const live = useAccount(account)
  const follow = useStore((s) => s.follow)
  const unfollow = useStore((s) => s.unfollow)
  const [confirming, setConfirming] = useState(false)
  if (live.kind === 'me') return null

  const label = live.iFollow ? 'Following' : live.followsMe ? 'Follow back' : 'Follow'
  const onClick = () => (live.iFollow ? setConfirming(true) : follow(live))

  return (
    <>
      {variant === 'text' ? (
        <button
          type="button"
          onClick={onClick}
          className={cx('shrink-0 text-[13px] font-semibold transition hover:opacity-70', live.iFollow ? 'text-fg' : 'text-accent', className)}
        >
          {label}
        </button>
      ) : (
        <Button size={size} variant={live.iFollow ? 'secondary' : 'primary'} block={block} onClick={onClick} className={className}>
          {label}
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => unfollow(live)}
        media={<Avatar account={live} size={84} />}
        title={`Unfollow @${live.username}?`}
        confirmLabel="Unfollow"
        danger
      />
    </>
  )
}
