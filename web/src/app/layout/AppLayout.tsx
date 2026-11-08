/**
 * The frame around every normal page.
 * Desktop (>= 768 px): the left sidebar (icons only until 1280 px, labels from there).
 * Phones: the top bar (Home only) and the bottom tab bar - the "app version".
 * The page itself keeps its place in the tree, so resizing across the breakpoint never reloads it.
 */
import { useLayoutEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useIsMobile } from '../../lib/hooks'
import { ErrorBoundary } from '../ErrorBoundary'
import { useBackgroundLocation } from '../navigation'
import { MobileTabBar } from './MobileTabBar'
import { MobileTopBar } from './MobileTopBar'
import { Sidebar } from './Sidebar'

/** Phone screens that hide the tab bar to use the whole screen (a chat, new message, the create flow). */
function isFullScreenOnPhone(path: string): boolean {
  return path.startsWith('/messages/') || path === '/create'
}

export function AppLayout() {
  const location = useLocation()
  const background = useBackgroundLocation()
  const path = (background ?? location).pathname
  const isMobile = useIsMobile()
  const showTabBar = isMobile && !isFullScreenOnPhone(path)

  // Full-height screens (reels, chats) and toasts read this to stay clear of the tab bar.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--tabbar-h', showTabBar ? 'calc(50px + env(safe-area-inset-bottom))' : '0px')
    return () => document.documentElement.style.setProperty('--tabbar-h', '0px')
  }, [showTabBar])

  return (
    <div className="min-h-dvh pb-[var(--tabbar-h)] md:pl-[72px] xl:pl-[244px]">
      <Sidebar />
      {path === '/' && <MobileTopBar />}
      <main className="min-w-0">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      {showTabBar && <MobileTabBar />}
    </div>
  )
}
