/**
 * Data hooks shared by the inbox, the new-message screen and the share sheet.
 */
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useDebouncedValue } from '../../lib/hooks'
import { useStore } from '../../lib/store'
import type { Account } from '../../lib/types'

export type LoadStatus = 'loading' | 'ready' | 'error'

/**
 * Load the inbox (conversations + requests) into the store. Conversations already in the store show
 * straight away while a fresh copy loads in the background; live events keep it current after that.
 */
export function useLoadInbox(): { status: LoadStatus; retry: () => void } {
  const [status, setStatus] = useState<LoadStatus>(() =>
    Object.keys(useStore.getState().conversations).length > 0 ? 'ready' : 'loading',
  )
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.conversations()
      .then((response) => {
        if (cancelled) return
        useStore.getState().setConversations(response)
        setStatus('ready')
      })
      .catch(() => {
        // With a cached inbox on screen a failed refresh is not worth an error screen.
        if (!cancelled) setStatus((current) => (current === 'ready' ? current : 'error'))
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])
  return { status, retry }
}

/** The current time, refreshed every `intervalMs`, so "2m" and "Active now" labels stay true. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

/** The people I follow (first page, closest friends first), for "Suggested" lists. null while loading. */
export function useFollowing(username: string): Account[] | null {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  useEffect(() => {
    let cancelled = false
    api.following(username)
      .then((response) => {
        if (!cancelled) setAccounts(response.accounts)
      })
      .catch(() => {
        if (!cancelled) setAccounts([])
      })
    return () => {
      cancelled = true
    }
  }, [username])
  return accounts
}

/** Search accounts by name as the query is typed (debounced). [] for an empty query. */
export function useAccountSearch(query: string): { results: Account[]; searching: boolean } {
  const typed = query.trim()
  const needle = useDebouncedValue(typed, 200)
  const [results, setResults] = useState<{ query: string; accounts: Account[] }>({ query: '', accounts: [] })

  useEffect(() => {
    if (!needle) return
    let cancelled = false
    api.search(needle)
      .then((response) => {
        if (!cancelled) setResults({ query: needle, accounts: response.accounts.filter((account) => account.kind !== 'me') })
      })
      .catch(() => {
        if (!cancelled) setResults({ query: needle, accounts: [] })
      })
    return () => {
      cancelled = true
    }
  }, [needle])

  if (!typed) return { results: [], searching: false }
  // Keep showing the previous results until the new ones arrive, so the list doesn't flicker.
  return { results: results.accounts, searching: needle !== typed || results.query !== needle }
}

/** Drop repeats (and me), keeping the first copy of each person. */
export function uniqueAccounts(accounts: Account[]): Account[] {
  const seen = new Set<string>()
  return accounts.filter((account) => {
    if (account.kind === 'me' || seen.has(account.id)) return false
    seen.add(account.id)
    return true
  })
}
