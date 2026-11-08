import { useId } from 'react'
import { cx } from '../lib/cx'

/** The "aura" wordmark: lowercase Fredoka with the aura gradient as its fill. Size it with text-* classes. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('aura-text select-none font-brand text-[28px] font-semibold leading-none tracking-tight', className)}>
      aura
    </span>
  )
}

/** The logo mark: a soft glowing ring in the aura gradient (same drawing as the favicon). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  // Gradient ids must be unique per instance, or a hidden copy elsewhere can break the fill.
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${id}-g`} x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9B7BFF" />
          <stop offset="0.35" stopColor="#FF7EC7" />
          <stop offset="0.6" stopColor="#FFC36B" />
          <stop offset="0.8" stopColor="#5CE1B5" />
          <stop offset="1" stopColor="#5BB8FF" />
        </linearGradient>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      <circle cx="32" cy="32" r="19" fill="none" stroke={`url(#${id}-g)`} strokeWidth="10" opacity="0.55" filter={`url(#${id}-blur)`} />
      <circle cx="32" cy="32" r="19" fill="none" stroke={`url(#${id}-g)`} strokeWidth="7.5" />
    </svg>
  )
}
