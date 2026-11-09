/**
 * Loads GET /api/session before anything else renders (with a branded splash meanwhile), then:
 * - sign-in on and nobody signed in -> /signin (remembering the page they wanted),
 * - not onboarded -> /onboarding (and onboarded people away from it),
 * and keeps the live connection open once onboarding is done.
 *
 * Onboarding finishes by calling useStore.getState().setSession(session) with the Session that
 * POST /api/onboarding returns; this gate then moves to the home feed.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { api, SIGNED_OUT_EVENT } from '../lib/api'
import { startLive } from '../lib/live'
import { useStore } from '../lib/store'
import { Splash } from './Splash'

export function SessionGate({ children }: { children: ReactNode }) {
  const ready = useStore((s) => s.ready)
  const onboarded = useStore((s) => s.onboarded)
  const signedOut = useStore((s) => s.authEnabled && !s.account)
  const [offline, setOffline] = useState(false)
  const { pathname, search } = useLocation()

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

  // Any request the server turns away with 401 means the session ended (expired, or signed out elsewhere).
  useEffect(() => {
    const onSignedOut = () => useStore.getState().markSignedOut()
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
  }, [])

  useEffect(() => {
    if (onboarded && !signedOut) return startLive()
  }, [onboarded, signedOut])

  if (!ready) return <Splash message={offline ? "Can't reach Aura right now. Trying again..." : null} />
  const onSignIn = pathname === '/signin'
  if (signedOut) return onSignIn ? children : <Navigate to={signInPath(pathname + search)} replace />
  if (onSignIn) return <Navigate to="/" replace />
  const onOnboarding = pathname === '/onboarding'
  if (!onboarded && !onOnboarding) return <Navigate to="/onboarding" replace />
  if (onboarded && onOnboarding) return <Navigate to="/" replace />
  return children
}

/** "/signin", plus ?next=<page> so signing in lands where they were going. */
function signInPath(wanted: string): string {
  return wanted === '/' || wanted.startsWith('/onboarding') ? '/signin' : `/signin?${new URLSearchParams({ next: wanted })}`
}
