import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { useEscapeKey, useLockBodyScroll } from '../../../lib/hooks'

/** A photo from a chat, full screen on black. Click anywhere, the X or Escape closes it. */
export function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useLockBodyScroll()
  useEscapeKey(onClose)

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/90 p-4 pt-safe md:p-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-[calc(env(safe-area-inset-top)+12px)] grid size-10 place-items-center rounded-full text-white transition hover:opacity-70"
      >
        <X size={28} strokeWidth={2} />
      </button>
      <motion.img
        src={src}
        alt="Photo"
        className="max-h-full max-w-full rounded-lg object-contain"
        initial={{ scale: 0.96 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.18 }}
        onClick={(event) => event.stopPropagation()}
      />
    </motion.div>,
    document.body,
  )
}
