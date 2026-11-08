import { useRef, useState, type PointerEvent } from 'react'

interface StoryGestureHandlers {
  /** Quick tap on the left third / the rest of the story. */
  onTapLeft: () => void
  onTapRight: () => void
  /** Finger moved sideways: swipe left = next person, swipe right = previous person. */
  onSwipeLeft: () => void
  onSwipeRight: () => void
  /** Pulled down far enough to close. */
  onSwipeDown: () => void
  /** A finger (or mouse button) is down on the story: it pauses until released. */
  onHoldChange: (holding: boolean) => void
}

const TAP_MS = 300
const TAP_MOVE_PX = 12
const SWIPE_PX = 60
const CLOSE_PX = 110

/**
 * Keep receiving this pointer's moves even when the finger leaves the element. The browser refuses
 * if the pointer is already gone; the gesture still works without capture, so that is ignored.
 */
export function capturePointer(event: PointerEvent<HTMLElement>) {
  try {
    event.currentTarget.setPointerCapture(event.pointerId)
  } catch {
    // no capture: moves outside the element are simply missed
  }
}

/**
 * Touch and mouse handling for the story viewer, written with plain pointer events:
 * press = pause, quick tap = previous/next, swipe sideways = change person, pull down = close.
 * Spread `handlers` on a layer covering the story; `pull` is how far it is being dragged down.
 */
export function useStoryGestures(on: StoryGestureHandlers) {
  const [pull, setPull] = useState(0)
  const start = useRef<{ x: number; y: number; time: number } | null>(null)

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return
    capturePointer(event)
    start.current = { x: event.clientX, y: event.clientY, time: performance.now() }
    on.onHoldChange(true)
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const from = start.current
    if (!from || event.pointerType === 'mouse') return
    const dx = event.clientX - from.x
    const dy = event.clientY - from.y
    setPull(dy > 0 && dy > Math.abs(dx) ? dy : 0)
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const from = start.current
    start.current = null
    setPull(0)
    on.onHoldChange(false)
    if (!from) return

    const dx = event.clientX - from.x
    const dy = event.clientY - from.y
    if (dy > CLOSE_PX && dy > Math.abs(dx)) return on.onSwipeDown()
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? on.onSwipeLeft() : on.onSwipeRight()

    const quick = performance.now() - from.time < TAP_MS
    if (quick && Math.abs(dx) < TAP_MOVE_PX && Math.abs(dy) < TAP_MOVE_PX) {
      const box = event.currentTarget.getBoundingClientRect()
      if (event.clientX - box.left < box.width / 3) on.onTapLeft()
      else on.onTapRight()
    }
  }

  function onPointerCancel() {
    start.current = null
    setPull(0)
    on.onHoldChange(false)
  }

  return { pull, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } }
}
