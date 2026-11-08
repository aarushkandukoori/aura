import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/cx'
import { useEscapeKey, useLockBodyScroll } from '../lib/hooks'
import { trapFocus, useFocusOnOpen } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message?: ReactNode
  /** Shown above the title (an avatar for "Unfollow?", a picture for "Delete post?"). */
  media?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button, for destructive actions. */
  danger?: boolean
}

/** "Are you sure?" with stacked full-width buttons: Unfollow, Delete post, Discard, Start over. */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, media, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }: ConfirmDialogProps) {
  useLockBodyScroll(open)
  useEscapeKey(onClose, open)
  const panel = useFocusOnOpen(open)

  return createPortal(
    <AnimatePresence>
      {open && (
        <div key="confirm" className="fixed inset-0 z-[70] flex items-center justify-center p-6">
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
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onKeyDown={trapFocus}
            className="relative w-full max-w-[400px] overflow-hidden rounded-2xl bg-elevated text-center text-fg shadow-pop outline-none"
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.16 }}
          >
            <div className="flex flex-col items-center gap-2 px-8 pb-6 pt-7">
              {media && <div className="mb-2">{media}</div>}
              <h2 className="text-lg font-semibold leading-snug">{title}</h2>
              {message && <p className="text-sm text-muted">{message}</p>}
            </div>
            <button
              type="button"
              onClick={() => {
                onConfirm()
                onClose()
              }}
              className={cx('block h-12 w-full border-t border-line text-sm font-bold hover:bg-surface', danger ? 'text-danger' : 'text-accent')}
            >
              {confirmLabel}
            </button>
            <button type="button" onClick={onClose} className="block h-12 w-full border-t border-line text-sm hover:bg-surface">
              {cancelLabel}
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
