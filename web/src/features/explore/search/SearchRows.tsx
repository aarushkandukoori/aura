import { Hash, X } from 'lucide-react'
import { Link } from 'react-router'
import { Avatar, IconButton, VerifiedBadge } from '../../../components'
import { cx } from '../../../lib/cx'
import { pluralize } from '../../../lib/format'
import { useAccount } from '../../../lib/store'
import type { Account } from '../../../lib/types'
import { itemHref, type SearchItem } from './searchItems'
import { socialLine, useProfileSummary } from './useProfileSummary'

interface SearchItemRowProps {
  item: SearchItem
  /** Position in the list; only the first rows fetch follower numbers. */
  index: number
  /** Called when the row is tapped (before navigating). */
  onSelect: () => void
  /** Recent searches get an X to remove them. */
  onRemove?: () => void
}

/** Only the first results look up "Followed by ..." lines, to keep typing light. */
const SUMMARY_ROWS = 12

const ROW = 'flex min-w-0 flex-1 items-center gap-3 px-4 py-2 md:px-6'

/** A person or a hashtag in search results or recent searches. */
export function SearchItemRow({ item, index, onSelect, onRemove }: SearchItemRowProps) {
  return (
    <div className="flex items-center transition-colors hover:bg-surface">
      <Link to={itemHref(item)} onClick={onSelect} className={ROW}>
        {item.type === 'account' ? (
          <AccountText account={item.account} withSummary={index < SUMMARY_ROWS} />
        ) : (
          <>
            <span className="m-1 grid size-11 shrink-0 place-items-center rounded-full border border-line-strong">
              <Hash size={20} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">#{item.tag}</span>
              <span className="block truncate text-sm text-muted">{pluralize(item.postCount, 'post')}</span>
            </span>
          </>
        )}
      </Link>
      {onRemove && (
        <IconButton label="Remove from recent" onClick={onRemove} className="mr-2 text-muted md:mr-4">
          <X size={18} />
        </IconButton>
      )}
    </div>
  )
}

/** Avatar (with a story ring when they have one), username, name and a "Followed by" line. */
function AccountText({ account: initial, withSummary }: { account: Account; withSummary: boolean }) {
  const account = useAccount(initial) // live follow / story state
  const profile = useProfileSummary(account.username, withSummary && account.kind !== 'me')
  const second = [account.displayName, socialLine(account, profile)].filter(Boolean).join(' • ')
  const ring = account.hasStory ? (account.storySeen ? 'seen' : 'unseen') : undefined

  return (
    <>
      {/* The ring is decoration here (the whole row opens the profile); rows without one keep the same width. */}
      <Avatar account={account} size={44} ring={ring} className={cx(!ring && 'm-1')} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-sm font-semibold">{account.username}</span>
          {account.verified && <VerifiedBadge size={13} />}
        </span>
        <span className="block truncate text-sm text-muted">{second}</span>
      </span>
    </>
  )
}
