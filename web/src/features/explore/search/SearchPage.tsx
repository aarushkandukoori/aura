import { ChevronLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useGoBack } from '../../../app/navigation'
import { useDebouncedValue } from '../../../lib/hooks'
import { addRecentSearch } from './recentSearches'
import { itemHref, orderResults } from './searchItems'
import { SearchResults } from './SearchResults'
import { SearchBox } from './SearchBox'
import { useSearch } from './useSearch'

/**
 * The search screen (/search): opened from the search bar on Explore on phones, and works as a
 * page on desktop too. The query is copied into the URL (?q=) so Back from a result keeps it.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams()
  // The box keeps its own state so typing stays instant; the URL catches up after a pause.
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const search = useSearch(query)
  const navigate = useNavigate()
  const goBack = useGoBack('/explore')

  const settled = useDebouncedValue(query.trim(), 400)
  const urlQuery = params.get('q') ?? ''
  useEffect(() => {
    if (settled !== urlQuery) setParams(settled ? { q: settled } : {}, { replace: true })
  }, [settled, urlQuery, setParams])

  function openTopResult() {
    const top = search.result ? orderResults(search.result, query)[0] : undefined
    if (!top) return
    addRecentSearch(top)
    navigate(itemHref(top))
  }

  return (
    <div className="mx-auto w-full max-w-[600px] md:pt-8">
      <div className="sticky top-0 z-20 border-b border-line bg-bg/95 pt-safe backdrop-blur-xl md:static md:border-b-0 md:bg-transparent md:backdrop-blur-none">
        <h1 className="hidden px-6 pb-6 text-2xl font-bold md:block">Search</h1>
        <div className="flex items-center gap-1 py-2 pl-1 pr-4 md:px-6 md:pb-4">
          <button type="button" aria-label="Back" onClick={goBack} className="grid size-11 shrink-0 place-items-center rounded-full hover:opacity-60 md:hidden">
            <ChevronLeft size={28} strokeWidth={1.75} />
          </button>
          <SearchBox value={query} onChange={setQuery} onSubmit={openTopResult} autoFocus className="flex-1" />
        </div>
      </div>
      <SearchResults query={query} search={search} />
    </div>
  )
}
