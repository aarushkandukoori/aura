import { motion } from 'motion/react'
import { useId, type ReactNode } from 'react'
import { cx } from '../lib/cx'

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (value: T) => void
  /** Accessible name of the group, e.g. "Appearance". */
  label?: string
  /** Stretch to the full width. */
  block?: boolean
  className?: string
}

/** A pill of mutually exclusive choices with a sliding thumb: System / Light / Dark. */
export function SegmentedControl<T extends string>({ options, value, onChange, label, block = false, className }: SegmentedControlProps<T>) {
  const thumbId = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-xl bg-surface-2 p-1', block && 'flex w-full', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors',
              active ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={`segment-thumb-${thumbId}`}
                className="absolute inset-0 rounded-lg bg-elevated shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
                transition={{ type: 'spring', damping: 30, stiffness: 420 }}
              />
            )}
            <span className="relative flex items-center gap-1.5 whitespace-nowrap">
              {option.icon}
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
