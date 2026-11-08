/**
 * The root component: router, session gate, every route, and the global overlays
 * (banners, toasts, milestone celebration) that can appear on any screen.
 */
import { MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { BrowserRouter } from 'react-router'
import { BannerHost, MilestoneCelebration, ToastHost } from '../components'
import { useStore } from '../lib/store'
import { applyTheme, watchSystemTheme } from '../lib/theme'
import { AppRoutes } from './routes'
import { ScrollManager } from './ScrollManager'
import { SessionGate } from './SessionGate'

export function App() {
  useDocumentTitle()
  useThemeSync()
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <SessionGate>
          <ScrollManager />
          <AppRoutes />
        </SessionGate>
        <BannerHost />
        <ToastHost />
        <MilestoneCelebration />
      </BrowserRouter>
    </MotionConfig>
  )
}

/** "(3) Aura" in the browser tab while there are unread notifications or chats. */
function useDocumentTitle() {
  const unread = useStore((s) => s.badges.notifications + s.badges.messages)
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Aura` : 'Aura'
  }, [unread])
}

/** Apply the chosen theme, and follow the system's light/dark switch while the choice is "system". */
function useThemeSync() {
  const theme = useStore((s) => s.theme)
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    return watchSystemTheme(() => applyTheme('system'))
  }, [theme])
}
