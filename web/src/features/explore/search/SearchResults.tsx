/**
 * Everything under the search box, shared by the phone search page and the desktop search panel:
 * recent searches (and suggestions) while the box is empty, live results while typing.
 */
import { SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfirmDialog, LoadingBlock, UserRow } from '../../../components'
import { api } from '../../../lib/api'
import { cx } from '../../../lib/cx'
import type { Account } from '../../../lib/types'
import { addRecentSearch, clearRecentSearches, removeRecentSearch, useRecentSearches } from './recentSearches'
import { orderResults, itemKey, type SearchItem } from './searchItems'
import { SearchItemRow } from './SearchRows'
import type { LiveSearch } from './useSearch'

interface SearchResultsProps {
  query: string
  search: LiveSearch
  /** Called after a result is picked (the desktop panel closes itself). */
  onSelect?: () => void
}

export function SearchResults({ query, search, onSelect }: SearchResultsProps) {
  const pick = (item: SearchItem) => {
    addRecentSearch(item)
    onSelect?.()
  }

  if (!query.trim()) return <RecentSearches onPick={pick} />
  if (search.error && !search.loading) return <p className="px-6 py-10 text-center text-sm text-muted">{search.error}</p>
  if (!search.result) return <LoadingBlock />

  const items = orderResults(search.result, query)
  if (items.length === 0) {
    return search.loading ? <LoadingBlock /> : <NoResults query={query.trim()} />
  }
  return (
    <div className={cx('py-2 transition-opacity', search.loading && 'opacity-60')}>
      {items.map((item, index) => (
        <SearchItemRow key={itemKey(item)} item={item} index={index} onSelect={() => pick(item)} />
      ))}
    </div>
  )
}

function RecentSearches({ onPick }: { onPick: (item: SearchItem) => void }) {
  const recent = useRecentSearches()
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="py-2">
      <div className="flex h-10 items-center justify-between px-4 md:px-6">
        <h3 className="text-base font-semibold">Recent</h3>
        {recent.length > 0 && (
          <button type="button" onClick={() => setConfirming(true)} className="text-sm font-semibold text-link hover:opacity-70">
            Clear all
          </button>
        )}
      </div>
      {recent.length === 0 ? (
        <>
          <p className="px-6 pb-6 pt-8 text-center text-sm text-muted">No recent searches.</p>
          <Suggestions />
        </>
      ) : (
        recent.map((item, index) => (
          <SearchItemRow
            key={itemKey(item)}
            item={item}
            index={index}
            onSelect={() => onPick(item)}
            onRemove={() => removeRecentSearch(item)}
          />
        ))
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={clearRecentSearches}
        title="Clear search history?"
        message="Your recent searches will be removed from this device."
        confirmLabel="Clear all"
        danger
      />
    </div>
  )
}

/** People to discover, so a brand-new search screen never looks empty. */
function Suggestions() {
  const [accounts, setAccounts] = useState<Account[]>([])
  useEffect(() => {
    let cancelled = false
    api
      .suggestions()
      .then((list) => {
        if (!cancelled) setAccounts(list.slice(0, 6))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (accounts.length === 0) return null
  return (
    <div className="border-t border-line pt-3">
      <h3 className="flex h-10 items-center px-4 text-base font-semibold md:px-6">Suggested for you</h3>
      {accounts.map((account) => (
        <UserRow key={account.id} account={account} follow className="md:px-6" />
      ))}
    </div>
  )
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <SearchX size={34} strokeWidth={1.5} className="text-muted" />
      <p className="mt-3 text-[15px] font-semibold">No results for "{query}"</p>
      <p className="mt-1 text-sm text-muted">Try a name, a username or a #hashtag.</p>
    </div>
  )
}
