/**
 * Small React hooks shared by every screen: screen size, debouncing, infinite scroll,
 * and the scroll lock + Escape key handling used by modals and sheets.
 */
import { useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'

/** Phones get the "app version" layout below this width (Tailwind's `md` breakpoint is 768px). */
export const MOBILE_QUERY = '(max-width: 767px)'

/** true while a CSS media query matches; updates when it changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

/** true on phone-sized screens (< 768 px wide). */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}

/** The value, but only after it stopped changing for `ms` (for search boxes). */
export function useDebouncedValue<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/**
 * Infinite scroll: put the returned ref on an element at the end of a list, and `onLoadMore` runs
 * when it comes within ~1.5 screens of view. Pass enabled = hasMore && !loading.
 */
export function useInfiniteScroll(onLoadMore: () => void, enabled: boolean): (node: Element | null) => void {
  const [node, setNode] = useState<Element | null>(null)
  const loadMore = useEffectEvent(onLoadMore)
  useEffect(() => {
    if (!node || !enabled) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore()
    }, { rootMargin: '1200px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, enabled])
  return setNode
}

const DOUBLE_TAP_MS = 280

/**
 * Tell a double tap from a single tap. Returns a click handler: `onDoubleTap` runs on a second tap
 * within 280 ms; `onSingleTap` (optional) runs only if no second tap follows, so a reel can pause
 * on one tap and like on two.
 */
export function useDoubleTap(onDoubleTap: () => void, onSingleTap?: () => void): () => void {
  const lastTap = useRef(0)
  const singleTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(singleTimer.current), [])
  return () => {
    const now = Date.now()
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      window.clearTimeout(singleTimer.current)
      lastTap.current = 0
      onDoubleTap()
      return
    }
    lastTap.current = now
    if (onSingleTap) singleTimer.current = window.setTimeout(onSingleTap, DOUBLE_TAP_MS)
  }
}

// Several overlays can be open at once (a sheet over a modal), so the page stays locked until the last one closes.
let scrollLocks = 0

/** Stop the page behind an open modal or sheet from scrolling. */
export function useLockBodyScroll(active = true): void {
  useEffect(() => {
    if (!active) return
    scrollLocks++
    document.documentElement.style.overflow = 'hidden'
    return () => {
      scrollLocks--
      if (scrollLocks === 0) document.documentElement.style.overflow = ''
    }
  }, [active])
}

// Escape closes only the top-most overlay: handlers form a stack and the newest one wins.
const escapeHandlers: (() => void)[] = []
let listening = false

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || escapeHandlers.length === 0) return
  event.preventDefault()
  escapeHandlers[escapeHandlers.length - 1]()
}

/** Call `handler` when Escape is pressed, if this is the top-most overlay. */
export function useEscapeKey(handler: () => void, active = true): void {
  const onEscape = useEffectEvent(handler)
  useEffect(() => {
    if (!active) return
    if (!listening) {
      window.addEventListener('keydown', onKeyDown)
      listening = true
    }
    const entry = () => onEscape()
    escapeHandlers.push(entry)
    return () => {
      const index = escapeHandlers.lastIndexOf(entry)
      if (index >= 0) escapeHandlers.splice(index, 1)
    }
  }, [active])
}
