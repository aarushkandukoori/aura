import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/cx'
import { useEscapeKey, useLockBodyScroll } from '../lib/hooks'
import { IconButton } from './IconButton'

export interface ModalProps {
  open: boolean
  onClose: () => void
  /** Shown in a header bar with a close button. Leave out for a bare panel. */
  title?: string
  children: ReactNode
  /** Max width: sm 400px (default), md 540px, lg 760px. */
  size?: 'sm' | 'md' | 'lg'
  /** Extra classes for the panel. */
  className?: string
}

const SIZES = { sm: 'max-w-[400px]', md: 'max-w-[540px]', lg: 'max-w-[760px]' }

/** A centered dialog over a dimmed page. Closes with Escape, the backdrop or the X. */
export function Modal({ open, onClose, title, children, size = 'sm', className }: ModalProps) {
  useLockBodyScroll(open)
  useEscapeKey(onClose, open)
  const panel = useFocusOnOpen(open)

  return createPortal(
    <AnimatePresence>
      {open && (
        <div key="modal" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-[var(--backdrop)]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onKeyDown={trapFocus}
            className={cx('relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-2xl bg-elevated text-fg shadow-pop outline-none', SIZES[size], className)}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {title && (
              <header className="relative flex h-12 shrink-0 items-center justify-center border-b border-line px-12">
                <h2 className="truncate text-base font-semibold">{title}</h2>
                <IconButton label="Close" className="absolute right-1.5" onClick={onClose}>
                  <X size={22} />
                </IconButton>
              </header>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Move keyboard focus into a dialog when it opens, and back to where it was when it closes. */
export function useFocusOnOpen(open: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus({ preventScroll: true })
    return () => previous?.focus?.({ preventScroll: true })
  }, [open])
  return ref
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

/**
 * onKeyDown for a dialog: keeps Tab inside it. From the last control Tab wraps to the first, and
 * Shift+Tab wraps the other way, so keyboard focus never wanders to the page behind the backdrop.
 */
export function trapFocus(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab' || event.defaultPrevented) return
  const dialog = event.currentTarget
  const active = document.activeElement
  // Keys from a menu or dialog portaled out of this one still reach it through React; that one keeps its own focus.
  if (!dialog.contains(active)) return
  const controls = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.tabIndex >= 0 && element.getClientRects().length > 0, // skips hidden ones
  )
  if (controls.length === 0) {
    event.preventDefault()
    return
  }
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}
