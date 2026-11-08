import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { api } from '../../lib/api'
import { useLiveEvent } from '../../lib/live'
import type { ID, ViewersResponse } from '../../lib/types'

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

/** false while the browser tab is in the background, so stories don't keep playing unseen. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribeToVisibility, () => document.visibilityState !== 'hidden')
}

/** true once `active` has stayed true for `ms` (the story hides its header while you hold it). */
export function useHeldFor(active: boolean, ms: number): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => setHeld(true), ms)
    return () => {
      window.clearTimeout(timer)
      setHeld(false)
    }
  }, [active, ms])
  return held
}

/**
 * Who has seen one of my stories (with their emoji reactions), refreshed live: the total updates
 * on every story.views event and the list reloads at most every 1.5 s while views pour in.
 */
export function useStoryViewers(storyId: ID): ViewersResponse | null {
  const [data, setData] = useState<ViewersResponse | null>(null)
  const refreshTimer = useRef<number | undefined>(undefined)

  const load = useCallback(() => {
    api.storyViewers(storyId).then(setData).catch(() => {})
  }, [storyId])

  useEffect(load, [load])
  useEffect(() => () => window.clearTimeout(refreshTimer.current), [])

  useLiveEvent('story.views', (event) => {
    if (event.storyId !== storyId) return
    setData((current) => (current ? { ...current, total: event.viewCount } : current))
    if (refreshTimer.current !== undefined) return
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = undefined
      load()
    }, 1500)
  })

  return data
}
