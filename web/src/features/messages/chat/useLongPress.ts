import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

const HOLD_MS = 450

/**
 * Touch and hold (phones): runs `onLongPress` after about half a second, the way native chat apps
 * open reactions. Spread the returned handlers on the element. The tap that ends a long press is
 * swallowed, so holding a photo doesn't also open it. Mouse and pen presses are ignored.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | undefined>(undefined)
  const fired = useRef(false)
  const cancel = () => window.clearTimeout(timer.current)
  useEffect(() => cancel, [])

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      fired.current = false
      if (event.pointerType !== 'touch') return
      cancel()
      timer.current = window.setTimeout(() => {
        fired.current = true
        navigator.vibrate?.(10)
        onLongPress()
      }, HOLD_MS)
    },
    // Lifting the finger, or the browser taking over to scroll, cancels the hold.
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (fired.current) event.preventDefault() // Android's own long-press menu
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!fired.current) return
      fired.current = false
      event.preventDefault()
      event.stopPropagation()
    },
  }
}
