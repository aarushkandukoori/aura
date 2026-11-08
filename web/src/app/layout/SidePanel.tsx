import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useEscapeKey } from '../../lib/hooks'

/**
 * The panel that slides out next to the collapsed desktop sidebar (Search, Notifications).
 * Clicking anywhere outside it or pressing Escape closes it.
 */
export function SidePanel({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  useEscapeKey(onClose, open)
  return (
    <AnimatePresence>
      {open && (
        <>
          <div key="outside" aria-hidden className="fixed inset-0 z-30 hidden md:block" onClick={onClose} />
          <motion.aside
            key="panel"
            aria-label={label}
            className="fixed inset-y-0 left-[72px] z-[35] hidden w-[397px] flex-col overflow-hidden rounded-r-2xl border-r border-line bg-bg shadow-pop md:flex"
            initial={{ x: -48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -48, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
