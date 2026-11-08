import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useStore, type Toast } from '../lib/store'

/**
 * Show a short message at the bottom of the screen. Works anywhere, even outside React:
 *   toast('Link copied')
 *   toast('Your post is live', { icon: '✨', action: { label: 'View', href: '/p/abc' } })
 */
export function toast(message: string, options: { icon?: string; action?: { label: string; href: string } } = {}): void {
  useStore.getState().pushToast({ message, ...options })
}

/** Renders the toasts. Mounted once in App. */
export function ToastHost() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[90] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(var(--tabbar-h) + 16px + env(safe-area-inset-bottom))' }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <ToastItem key={item.id} toast={item} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useStore((s) => s.dismissToast)
  const navigate = useNavigate()
  const action = toast.action

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), 3500)
    return () => window.clearTimeout(timer)
  }, [toast.id, dismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="pointer-events-auto flex max-w-[min(420px,100%)] items-center gap-2.5 rounded-xl bg-fg px-4 py-3 text-sm font-medium text-bg shadow-pop"
    >
      {toast.icon && <span aria-hidden>{toast.icon}</span>}
      <span className="min-w-0 flex-1">{toast.message}</span>
      {action && (
        <button
          type="button"
          className="shrink-0 font-semibold underline-offset-2 hover:underline"
          onClick={() => {
            dismiss(toast.id)
            navigate(action.href)
          }}
        >
          {action.label}
        </button>
      )}
    </motion.div>
  )
}
