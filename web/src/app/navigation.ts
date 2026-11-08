/**
 * Navigation helpers, so every feature opens posts, stories and modals the same way.
 *
 * Modal routes: on desktop, /p/:id, /p/:id/likes and /create opened from inside the app appear as a
 * modal over the page you were on. The trick is `state.background`: we navigate with the current
 * location saved in the history entry, and app/routes.tsx keeps rendering that background page with
 * the modal on top. Story and highlight viewers open as full-screen overlays the same way (on phones
 * too). A direct load has no background, so the same URL renders as a normal full page.
 */
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, type RefObject } from 'react'
import { useLocation, useNavigate, type Location } from 'react-router'
import { useIsMobile } from '../lib/hooks'
import type { ID } from '../lib/types'

export interface NavState {
  background?: Location
}

/** The page under the current modal/overlay, or null when nothing is open on top. */
export function useBackgroundLocation(): Location | null {
  const location = useLocation()
  return (location.state as NavState | null)?.background ?? null
}

/** Navigation state that keeps the current page underneath (reuses the existing background if a modal is already open). */
function useOverlayState(): NavState {
  const location = useLocation()
  const background = useBackgroundLocation()
  return useMemo(() => ({ background: background ?? location }), [background, location])
}

/** Returns openPost(id): a modal over the current page on desktop, a full page on phones. */
export function useOpenPost(): (postId: ID) => void {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const state = useOverlayState()
  return useCallback(
    (postId: ID) => navigate(`/p/${postId}`, isMobile ? undefined : { state }),
    [navigate, isMobile, state],
  )
}

/** Returns openLikes(postId): the likes list, as a modal on desktop and a page on phones. */
export function useOpenLikes(): (postId: ID) => void {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const state = useOverlayState()
  return useCallback(
    (postId: ID) => navigate(`/p/${postId}/likes`, isMobile ? undefined : { state }),
    [navigate, isMobile, state],
  )
}

/**
 * Returns openStory(username): the full-screen story viewer over the current page.
 * The viewer moves to the next person's stories with openStory(next, { replace: true }).
 */
export function useOpenStory(): (username: string, options?: { replace?: boolean }) => void {
  const navigate = useNavigate()
  const state = useOverlayState()
  return useCallback(
    (username: string, options?: { replace?: boolean }) => navigate(`/stories/${username}`, { state, replace: options?.replace }),
    [navigate, state],
  )
}

/** Returns openHighlight(id): the full-screen highlight viewer over the current page. */
export function useOpenHighlight(): (highlightId: ID) => void {
  const navigate = useNavigate()
  const state = useOverlayState()
  return useCallback((highlightId: ID) => navigate(`/highlights/${highlightId}`, { state }), [navigate, state])
}

/** Returns openCreate(): the new-post flow, as a modal on desktop and a full page on phones. */
export function useOpenCreate(): () => void {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const state = useOverlayState()
  return useCallback(() => navigate('/create', isMobile ? undefined : { state }), [navigate, isMobile, state])
}

/** Returns openStoryComposer(): the full-screen "new story" composer over the current page. */
export function useOpenStoryComposer(): () => void {
  const navigate = useNavigate()
  const state = useOverlayState()
  return useCallback(() => navigate('/create/story', { state }), [navigate, state])
}

/**
 * Returns close() for a modal or overlay: goes back to the page underneath, or to `fallback`
 * when the overlay was loaded directly (nothing underneath).
 */
export function useCloseOverlay(fallback = '/'): () => void {
  const navigate = useNavigate()
  const background = useBackgroundLocation()
  return useCallback(() => {
    if (background) navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, background, fallback])
}

/** Returns goBack(): the previous page, or `fallback` when this page was opened directly. */
export function useGoBack(fallback = '/'): () => void {
  const navigate = useNavigate()
  return useCallback(() => {
    // react-router keeps the position in the history stack in history.state.idx.
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (index > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, fallback])
}

/** true inside a route modal (desktop post / likes / create), so a page can switch to its modal layout. */
export const InModalContext = createContext(false)

export function useInModal(): boolean {
  return useContext(InModalContext)
}

/** RouteModal's close guard: while a page inside has put a function here, closing the modal calls it instead. */
export const ModalCloseGuardContext = createContext<RefObject<(() => void) | null> | null>(null)

/**
 * Inside a route modal, while `active` is true, the backdrop, the X and Escape call `onClose`
 * instead of closing the modal. The post editor uses it to ask "Discard post?" first.
 */
export function useModalCloseGuard(onClose: () => void, active: boolean): void {
  const guard = useContext(ModalCloseGuardContext)
  const handleClose = useEffectEvent(onClose)
  useEffect(() => {
    if (!guard || !active) return
    guard.current = () => handleClose()
    return () => {
      guard.current = null
    }
  }, [guard, active])
}
