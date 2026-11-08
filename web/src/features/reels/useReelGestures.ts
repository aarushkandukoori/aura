import { useEffect, useRef, type MouseEvent } from 'react'
import { useDoubleTap } from '../../lib/hooks'

/** Press this long to pause (and keep holding to stay paused). */
const HOLD_MS = 220

interface ReelGestures {
  onTap: () => void
  onDoubleTap: () => void
  /** true when a press turns into a hold, false when it ends. */
  onHoldChange: (holding: boolean) => void
}

/**
 * Touch and mouse gestures on a reel: tap, double tap (like) and press-and-hold (pause while
 * held). A hold never also counts as a tap. Spread the result onto the reel's media layer.
 */
export function useReelGestures({ onTap, onDoubleTap, onHoldChange }: ReelGestures) {
  const holdTimer = useRef<number | undefined>(undefined)
  const held = useRef(false)
  const onClick = useDoubleTap(onDoubleTap, onTap)

  useEffect(() => () => window.clearTimeout(holdTimer.current), [])

  function pressStart() {
    held.current = false
    window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => {
      held.current = true
      onHoldChange(true)
    }, HOLD_MS)
  }

  // Finger lifted, pointer left, or the browser took over to scroll.
  function pressEnd() {
    window.clearTimeout(holdTimer.current)
    if (held.current) onHoldChange(false)
  }

  return {
    onPointerDown: pressStart,
    onPointerUp: pressEnd,
    onPointerLeave: pressEnd,
    onPointerCancel: pressEnd,
    onClick: () => {
      if (held.current) {
        held.current = false // the click that ends a hold
        return
      }
      onClick()
    },
    // A long press on phones would otherwise open the browser's image menu.
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  }
}
