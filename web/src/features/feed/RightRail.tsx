import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Avatar, FollowButton, UsernameLink } from '../../components'
import { api } from '../../lib/api'
import { useAccount, useMe } from '../../lib/store'
import type { Account } from '../../lib/types'

/** The column beside the feed on wide screens: my account, "Suggested for you", and a small footer. */
export function RightRail() {
  const me = useMe()
  return (
    <div className="sticky top-0 pt-2">
      <div className="flex items-center gap-3">
        <Avatar account={me} size={44} story link />
        <div className="min-w-0 flex-1 leading-tight">
          <UsernameLink account={me} className="text-sm" />
          <p className="truncate text-sm text-muted">{me.displayName}</p>
        </div>
        <Link to="/settings" className="text-xs font-semibold text-accent hover:text-accent-hover">
          Settings
        </Link>
      </div>
      <Suggestions />
      <RailFooter />
    </div>
  )
}

function Suggestions() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api.suggestions()
      .then((list) => {
        if (!cancelled) setAccounts(list.slice(0, 5))
      })
      .catch(() => {
        if (!cancelled) setAccounts([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (accounts && accounts.length === 0) return null
  return (
    <section aria-label="Suggested for you" className="mt-6">
      <h2 className="mb-1 text-sm font-semibold text-muted">Suggested for you</h2>
      {accounts
        ? accounts.map((account) => <SuggestionRow key={account.id} account={account} />)
        : Array.from({ length: 5 }, (_, i) => (
            <div key={i} aria-hidden className="flex items-center gap-3 py-2">
              <div className="shimmer size-11 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="shimmer h-3 w-28 rounded-full" />
                <div className="shimmer h-2.5 w-20 rounded-full" />
              </div>
            </div>
          ))}
    </section>
  )
}

function SuggestionRow({ account }: { account: Account }) {
  const live = useAccount(account)
  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar account={account} size={44} story link />
      <div className="min-w-0 flex-1 leading-tight">
        <UsernameLink account={account} className="text-sm" />
        <p className="truncate text-xs text-muted">{suggestionReason(live)}</p>
      </div>
      <FollowButton account={account} variant="text" />
    </div>
  )
}

/** The small grey line under a suggestion. */
function suggestionReason(account: Account): string {
  if (account.followsMe) return 'Follows you'
  if (account.role === 'creator') return 'Popular on Aura'
  if (account.role === 'mutual') return 'Followed by friends'
  return 'Suggested for you'
}

const FOOTER_LINKS = [
  { label: 'About', to: '/settings' },
  { label: 'Explore', to: '/explore' },
  { label: 'Reels', to: '/reels' },
  { label: 'Saved', to: '/saved' },
  { label: 'Settings', to: '/settings' },
]

function RailFooter() {
  return (
    <footer className="mt-8 text-xs text-muted">
      <nav aria-label="More" className="flex flex-wrap gap-x-1.5 gap-y-1">
        {FOOTER_LINKS.map((link, index) => (
          <Fragment key={link.label}>
            {index > 0 && <span aria-hidden>·</span>}
            <Link to={link.to} className="hover:underline">
              {link.label}
            </Link>
          </Fragment>
        ))}
      </nav>
      <p className="mt-4 uppercase tracking-wide">© {new Date().getFullYear()} Aura</p>
    </footer>
  )
}
