import { AnimatePresence, motion, useDragControls } from 'motion/react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/cx'
import { useEscapeKey, useIsMobile, useLockBodyScroll } from '../lib/hooks'
import { Modal, trapFocus, useFocusOnOpen } from './Modal'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Extra classes for the scrolling content area. */
  className?: string
  /** Desktop modal width (see Modal). */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * A bottom sheet on phones (slides up, swipe down on the handle to close) and a centered modal on
 * desktop. Use it for comments, share, viewers, option lists.
 */
export function Sheet(props: SheetProps) {
  const isMobile = useIsMobile()
  if (!isMobile) {
    return (
      <Modal open={props.open} onClose={props.onClose} title={props.title} size={props.size}>
        <div className={props.className}>{props.children}</div>
      </Modal>
    )
  }
  return <BottomSheet {...props} />
}

function BottomSheet({ open, onClose, title, children, className }: SheetProps) {
  useLockBodyScroll(open)
  useEscapeKey(onClose, open)
  const panel = useFocusOnOpen(open)
  const drag = useDragControls()

  return createPortal(
    <AnimatePresence>
      {open && (
        <div key="sheet" className="fixed inset-0 z-[60]">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-[var(--backdrop)]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            onKeyDown={trapFocus}
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl bg-elevated pb-safe text-fg shadow-pop outline-none"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 380 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose()
            }}
          >
            {/* Only the handle area starts a drag, so the content can still scroll. */}
            <div className="shrink-0 cursor-grab touch-none pt-2" onPointerDown={(event) => drag.start(event)}>
              <div className="mx-auto h-1 w-10 rounded-full bg-line-strong" />
              {title ? (
                <h2 className="border-b border-line py-3 text-center text-base font-semibold">{title}</h2>
              ) : (
                <div className="h-3" />
              )}
            </div>
            <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
