import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { useDebouncedValue } from '../../../lib/hooks'
import { trackSearch } from '../../../lib/track'
import type { SearchResult } from '../../../lib/types'

/** What a search box shows: the latest results, an error, and whether newer results are on the way. */
export interface LiveSearch {
  result: SearchResult | null
  error: string | null
  /** true while the results on screen belong to an older query. */
  loading: boolean
}

interface SearchState {
  /** The query these results belong to. */
  query: string
  result: SearchResult | null
  error: string | null
}

/**
 * Search as you type: waits until typing pauses for 250 ms, then asks the server. The previous
 * results stay on screen while the next ones load, so the list never flickers empty.
 */
export function useSearch(query: string): LiveSearch {
  const text = query.trim()
  const debounced = useDebouncedValue(text, 250)
  const [state, setState] = useState<SearchState>({ query: '', result: null, error: null })
  // A query the user stopped typing for a second is a search the recommendation algorithm learns from.
  const settled = useDebouncedValue(text, 1000)
  useEffect(() => trackSearch(settled), [settled])

  useEffect(() => {
    if (!debounced) return
    let cancelled = false
    api
      .search(debounced)
      .then((result) => {
        if (!cancelled) setState({ query: debounced, result, error: null })
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ query: debounced, result: null, error: error.message })
      })
    return () => {
      cancelled = true // a newer query is on its way; ignore this answer
    }
  }, [debounced])

  return {
    result: text ? state.result : null,
    error: text ? state.error : null,
    loading: text !== '' && state.query !== text,
  }
}
