import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

interface EmptyStateProps {
  /** A lucide icon element, e.g. <Camera size={30} strokeWidth={1.5} />. */
  icon?: ReactNode
  title: string
  body?: ReactNode
  /** A button or link under the text. */
  action?: ReactNode
  className?: string
}

/** The "nothing here yet" block: an icon in a circle, a title, a line of text and an optional action. */
export function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center px-8 py-14 text-center', className)}>
      {icon && <div className="mb-4 grid size-[68px] place-items-center rounded-full border-2 border-fg">{icon}</div>}
      <h2 className="text-xl font-bold">{title}</h2>
      {body && <p className="mt-2 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
