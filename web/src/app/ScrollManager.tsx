/**
 * Scroll position per page: a new page starts at the top, Back/Forward returns to where you were,
 * and opening or closing a modal or story never moves the page underneath.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { useBackgroundLocation } from './navigation'

/** Saved window.scrollY by history entry key. */
const positions = new Map<string, number>()

export function ScrollManager() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const background = useBackgroundLocation()
  // While a modal is open, the page on screen is the background page.
  const pageKey = (background ?? location).key
  const currentKey = useRef(pageKey)

  useEffect(() => {
    window.history.scrollRestoration = 'manual' // we restore it ourselves, after the page has rendered
    const onScroll = () => positions.set(currentKey.current, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    currentKey.current = pageKey
    const saved = positions.get(pageKey)
    if (navigationType !== 'POP' || saved === undefined) {
      window.scrollTo(0, 0)
      return
    }
    // The page may still be filling in from the cache, so keep trying for up to ~half a second.
    let frame = 0
    let tries = 0
    const restore = () => {
      window.scrollTo(0, saved)
      if (Math.abs(window.scrollY - saved) > 2 && tries++ < 30) frame = requestAnimationFrame(restore)
    }
    restore()
    return () => cancelAnimationFrame(frame)
  }, [pageKey]) // only a change of page matters; navigationType is read at that moment

  return null
}
