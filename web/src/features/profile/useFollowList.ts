/**
 * One page after another of someone's followers or following, optionally filtered by a search word.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import type { Account } from '../../lib/types'

export type FollowMode = 'followers' | 'following'

interface Loaded {
  key: string
  accounts: Account[]
  cursor: string | null
  total: number
}

export function useFollowList(username: string, mode: FollowMode, query: string) {
  const key = `${username}|${mode}|${query}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  // Answers for an older search (or the other tab) are dropped when they arrive late.
  const latestKey = useRef(key)
  useEffect(() => {
    latestKey.current = key
  }, [key])

  const load = useCallback(
    async (cursor: string | null) => {
      setLoadingKey(key)
      setError(null)
      try {
        const page = mode === 'followers' ? await api.followers(username, cursor, query) : await api.following(username, cursor, query)
        if (latestKey.current !== key) return
        setLoaded((current) => {
          const before = cursor && current?.key === key ? current.accounts : []
          const known = new Set(before.map((account) => account.id))
          return { key, accounts: [...before, ...page.accounts.filter((account) => !known.has(account.id))], cursor: page.nextCursor, total: page.total }
        })
      } catch (cause) {
        if (latestKey.current === key) setError({ key, message: cause instanceof Error ? cause.message : 'Something went wrong' })
      } finally {
        setLoadingKey((current) => (current === key ? null : current))
      }
    },
    [key, mode, username, query],
  )

  useEffect(() => {
    load(null)
  }, [load])

  const current = loaded?.key === key ? loaded : null
  const errorMessage = error?.key === key ? error.message : null
  const loadingMore = loadingKey === key
  const done = current ? current.cursor === null : false
  return {
    accounts: current?.accounts ?? [],
    total: current?.total ?? null,
    loading: !current && !errorMessage,
    loadingMore,
    error: errorMessage,
    done,
    loadMore: () => {
      if (current && !done && !loadingMore) load(current.cursor)
    },
    /** After a failed page: try that page again. */
    retry: () => load(current ? current.cursor : null),
  }
}
