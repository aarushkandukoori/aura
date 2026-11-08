import { Check } from 'lucide-react'
import { cx } from '../../lib/cx'

/** The round checkbox on a person you can pick (new message, share sheet). */
export function PickMark({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
        checked ? 'border-accent bg-accent text-white' : 'border-line-strong',
        className,
      )}
    >
      {checked && <Check size={14} strokeWidth={3} />}
    </span>
  )
}
