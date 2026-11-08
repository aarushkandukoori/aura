import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../lib/cx'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'bg-surface-2 text-fg hover:bg-line',
  ghost: 'text-fg hover:bg-surface',
  danger: 'bg-danger text-white hover:brightness-95',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-lg',
  md: 'h-9 px-4 text-sm rounded-lg',
  lg: 'h-11 px-5 text-[15px] rounded-xl',
}

/** The classes of a button, so a <Link> can look like one: <Link className={buttonClasses({ variant: 'secondary' })}>. */
export function buttonClasses({ variant = 'primary', size = 'md', block = false }: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}): string {
  return cx(
    'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap font-semibold transition-colors active:opacity-80',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Full width. */
  block?: boolean
  /** Shows a spinner and blocks clicks. */
  loading?: boolean
}

export function Button({ variant, size, block, loading = false, disabled, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClasses({ variant, size, block }), className)}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 20 : 16} /> : children}
    </button>
  )
}
