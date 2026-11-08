import { useEffect, useEffectEvent, useRef, useState } from 'react'

/** How far (px, after resistance) you pull before letting go refreshes. */
export const PULL_THRESHOLD = 64
const MAX_PULL = 110
/** The local server answers in milliseconds; keep the spinner up a moment so it doesn't just flicker. */
const MIN_SPIN_MS = 700

/**
 * Pull to refresh on phones: drag down while the page is at the very top, let go past the
 * threshold, and `onRefresh` runs. Returns how far it is pulled (for the indicator), whether you
 * are still pulling, and whether a refresh is running.
 */
export function usePullToRefresh(onRefresh: () => Promise<void>, enabled: boolean) {
  const [distance, setDistance] = useState(0)
  const [pulling, setPulling] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const busy = useRef(false)
  const refresh = useEffectEvent(onRefresh)

  useEffect(() => {
    if (!enabled) return
    let startY: number | null = null
    let pulled = 0

    // The browser's own pull-to-refresh (Android) would reload the whole page on top of ours.
    const root = document.documentElement
    const previous = root.style.overscrollBehaviorY
    root.style.overscrollBehaviorY = 'contain'

    function onStart(event: TouchEvent) {
      startY = window.scrollY <= 0 && !busy.current ? event.touches[0].clientY : null
      pulled = 0
    }
    function onMove(event: TouchEvent) {
      if (startY === null) return
      const dy = event.touches[0].clientY - startY
      // Half the finger's travel, so it feels like pulling against a spring.
      pulled = dy > 0 && window.scrollY <= 0 ? Math.min(MAX_PULL, dy * 0.5) : 0
      setDistance(pulled)
      setPulling(pulled > 0)
    }
    async function onEnd() {
      if (startY === null) return
      startY = null
      setPulling(false)
      setDistance(0)
      if (pulled < PULL_THRESHOLD || busy.current) return
      busy.current = true
      setRefreshing(true)
      try {
        await Promise.all([refresh(), new Promise((resolve) => window.setTimeout(resolve, MIN_SPIN_MS))])
      } finally {
        busy.current = false
        setRefreshing(false)
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      root.style.overscrollBehaviorY = previous
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [enabled])

  return { distance, pulling, refreshing }
}
