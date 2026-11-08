import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../lib/cx'

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** What the button does, read by screen readers and shown as a tooltip ("Like", "Close"). */
  label: string
  /** 32, 40 (default) or 44 px square. */
  size?: 'sm' | 'md' | 'lg'
  /** plain fades on hover (action bars); soft gets a round background (toolbars, headers). */
  variant?: 'plain' | 'soft'
}

const SIZES = { sm: 'size-8', md: 'size-10', lg: 'size-11' }

/** A round, icon-only button: <IconButton label="Close" onClick={close}><X /></IconButton>. */
export function IconButton({ label, size = 'md', variant = 'plain', className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-grid shrink-0 place-items-center rounded-full transition disabled:pointer-events-none disabled:opacity-40',
        variant === 'plain' ? 'hover:opacity-60 active:opacity-40' : 'hover:bg-surface active:bg-surface-2',
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
