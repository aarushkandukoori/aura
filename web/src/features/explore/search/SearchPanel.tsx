import { useState } from 'react'
import { useNavigate } from 'react-router'
import { addRecentSearch } from './recentSearches'
import { itemHref, orderResults } from './searchItems'
import { SearchResults } from './SearchResults'
import { SearchBox } from './SearchBox'
import { useSearch } from './useSearch'

/**
 * Desktop search: the content of the panel that slides out next to the sidebar
 * (397 px wide, full height). Picking a result closes the panel.
 */
export function SearchPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const search = useSearch(query)
  const navigate = useNavigate()

  // Enter opens the top result.
  function openTopResult() {
    const top = search.result ? orderResults(search.result, query)[0] : undefined
    if (!top) return
    addRecentSearch(top)
    navigate(itemHref(top))
    onClose()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-6 pb-6 pt-6">
        <h2 className="mb-8 text-2xl font-bold">Search</h2>
        <SearchBox value={query} onChange={setQuery} onSubmit={openTopResult} autoFocus />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <SearchResults query={query} search={search} onSelect={onClose} />
      </div>
    </div>
  )
}
