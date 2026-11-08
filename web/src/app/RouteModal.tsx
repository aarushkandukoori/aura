import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { trapFocus, useFocusOnOpen } from '../components/Modal'
import { useEscapeKey, useLockBodyScroll } from '../lib/hooks'
import { ErrorBoundary } from './ErrorBoundary'
import { InModalContext, ModalCloseGuardContext, useCloseOverlay } from './navigation'

/**
 * The frame around a desktop route modal (/p/:id, /p/:id/likes, /create opened from inside the app):
 * dimmed backdrop, white X in the corner, Escape / backdrop click to close (back to the page underneath).
 * The page inside picks its own size; useInModal() tells it that it is in a modal, and
 * useModalCloseGuard() lets it ask first before the modal closes.
 */
export function RouteModal({ label, children }: { label: string; children: ReactNode }) {
  const close = useCloseOverlay()
  const { pathname } = useLocation()
  // Focus the dialog so keyboard and screen-reader users land inside it, and go back where they were on close.
  const dialog = useFocusOnOpen(true)
  const closeGuard = useRef<(() => void) | null>(null)
  const requestClose = () => (closeGuard.current ? closeGuard.current() : close())
  useLockBodyScroll()
  useEscapeKey(requestClose)

  return (
    // The focus trap is on this outer box so Tab can reach the X as well as the dialog.
    <div onKeyDown={trapFocus} className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[var(--backdrop)]"
        onClick={requestClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
      />
      <button
        type="button"
        aria-label="Close"
        onClick={requestClose}
        className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full text-white transition hover:opacity-70"
      >
        <X size={28} strokeWidth={2} />
      </button>
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="relative flex max-h-full max-w-full overflow-hidden rounded-xl bg-elevated text-fg shadow-pop outline-none"
        initial={{ opacity: 0, scale: 1.03 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <InModalContext.Provider value={true}>
          <ModalCloseGuardContext.Provider value={closeGuard}>
            <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
          </ModalCloseGuardContext.Provider>
        </InModalContext.Provider>
      </motion.div>
    </div>
  )
}
