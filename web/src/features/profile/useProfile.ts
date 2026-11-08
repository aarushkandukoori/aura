/**
 * Loading a profile page by username.
 * My own profile comes straight from the store, so followers, posts and aura tick up live (me.stats).
 * Other profiles are fetched (and remembered, so coming back shows them instantly while they refresh).
 */
import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { useAccount, useMe, useStore } from '../../lib/store'
import type { Profile } from '../../lib/types'

/** Profiles seen during this visit, by lowercase username. */
const seen = new Map<string, Profile>()

export interface ProfileState {
  profile: Profile | null
  isMe: boolean
  /** HTTP status of a failed load (404 = no such account). */
  error: number | null
  retry: () => void
}

export function useProfile(username: string): ProfileState {
  const me = useMe()
  const key = username.toLowerCase()
  const isMe = key === me.username.toLowerCase()
  const [loaded, setLoaded] = useState<{ key: string; profile: Profile | null; error: number | null }>({ key: '', profile: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (isMe) return
    let cancelled = false
    api.profile(key)
      .then((profile) => {
        if (cancelled) return
        seen.set(key, profile)
        useStore.getState().upsertAccounts([profile]) // freshest follow / story state for every avatar on screen
        setLoaded({ key, profile, error: null })
      })
      .catch((error) => {
        if (!cancelled) setLoaded({ key, profile: null, error: error instanceof ApiError ? error.status : 500 })
      })
    return () => {
      cancelled = true
    }
  }, [key, isMe, attempt])

  const retry = () => setAttempt((n) => n + 1)
  if (isMe) return { profile: me, isMe, error: null, retry }
  const current = loaded.key === key ? loaded : null
  return { profile: current?.profile ?? seen.get(key) ?? null, isMe, error: current?.error ?? null, retry }
}

/** Their follower count, including my follow or unfollow from a moment ago. */
export function useFollowerCount(profile: Profile): number {
  const live = useAccount(profile)
  if (profile.isMe || live.iFollow === profile.iFollow) return profile.followers
  return Math.max(0, profile.followers + (live.iFollow ? 1 : -1))
}
