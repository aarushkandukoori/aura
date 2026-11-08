/**
 * Loads GET /api/session before anything else renders (with a branded splash meanwhile), sends
 * people who haven't onboarded to /onboarding (and onboarded people away from it), and keeps the
 * live connection open once onboarding is done.
 *
 * Onboarding finishes by calling useStore.getState().setSession(session) with the Session that
 * POST /api/onboarding returns; this gate then moves to the home feed.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { api } from '../lib/api'
import { startLive } from '../lib/live'
import { useStore } from '../lib/store'
import { Splash } from './Splash'

export function SessionGate({ children }: { children: ReactNode }) {
  const ready = useStore((s) => s.ready)
  const onboarded = useStore((s) => s.onboarded)
  const [offline, setOffline] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | undefined
    async function load() {
      try {
        const session = await api.session()
        if (!cancelled) useStore.getState().setSession(session)
      } catch {
        if (cancelled) return
        // The server may still be starting up: say so and keep trying.
        setOffline(true)
        retryTimer = window.setTimeout(load, 3000)
      }
    }
    load()
    return () => {
      cancelled = true
      window.clearTimeout(retryTimer)
    }
  }, [])

  useEffect(() => {
    if (onboarded) return startLive()
  }, [onboarded])

  if (!ready) return <Splash message={offline ? "Can't reach Aura right now. Trying again..." : null} />
  const onOnboarding = pathname === '/onboarding'
  if (!onboarded && !onOnboarding) return <Navigate to="/onboarding" replace />
  if (onboarded && onOnboarding) return <Navigate to="/" replace />
  return children
}
