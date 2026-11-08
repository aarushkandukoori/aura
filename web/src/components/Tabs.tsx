import { motion } from 'motion/react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../lib/cx'

export interface TabItem {
  value: string
  label: string
  icon?: ReactNode
  /** Make the tab a link (profile tabs are routes). */
  href?: string
  /** A small count bubble (e.g. message requests). */
  badge?: number
}

interface TabsProps {
  items: TabItem[]
  value: string
  onChange?: (value: string) => void
  /** Hide the text on phones and show only icons. */
  iconsOnMobile?: boolean
  className?: string
}

/** A row of tabs with a sliding underline: profile Posts / Reels / Tagged, inbox Primary / Requests. */
export function Tabs({ items, value, onChange, iconsOnMobile = false, className }: TabsProps) {
  const underlineId = useId()
  return (
    <div role="tablist" className={cx('flex border-b border-line', className)}>
      {items.map((item) => {
        const active = item.value === value
        const content = (
          <>
            {item.icon}
            <span className={iconsOnMobile && item.icon ? 'sr-only md:not-sr-only' : undefined}>{item.label}</span>
            {item.badge ? (
              <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-like px-1 text-[11px] font-bold text-white">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            ) : null}
            {active && (
              <motion.span
                layoutId={`tab-underline-${underlineId}`}
                className="absolute inset-x-0 -bottom-px h-[1.5px] bg-fg"
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              />
            )}
          </>
        )
        const classes = cx(
          'relative flex h-12 flex-1 items-center justify-center gap-1.5 text-[13px] font-semibold tracking-wide transition-colors',
          active ? 'text-fg' : 'text-muted hover:text-fg',
        )
        return item.href ? (
          <Link key={item.value} to={item.href} role="tab" aria-selected={active} className={classes} onClick={() => onChange?.(item.value)}>
            {content}
          </Link>
        ) : (
          <button key={item.value} type="button" role="tab" aria-selected={active} className={classes} onClick={() => onChange?.(item.value)}>
            {content}
          </button>
        )
      })}
    </div>
  )
}
