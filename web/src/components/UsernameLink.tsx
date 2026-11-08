import { Link } from 'react-router'
import { cx } from '../lib/cx'
import type { Account } from '../lib/types'
import { VerifiedBadge } from './VerifiedBadge'

/** A bold username linking to the profile, with the verified mark when they have one. */
export function UsernameLink({ account, className, badgeSize = 12 }: { account: Account; className?: string; badgeSize?: number }) {
  return (
    <Link
      to={`/${account.username}`}
      onClick={(event) => event.stopPropagation()}
      className={cx('inline-flex min-w-0 items-center gap-1 font-semibold hover:opacity-70', className)}
    >
      <span className="truncate">{account.username}</span>
      {account.verified && <VerifiedBadge size={badgeSize} />}
    </Link>
  )
}
