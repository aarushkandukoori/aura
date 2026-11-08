import { cx } from '../lib/cx'

// A 16-point seal: points alternate between an outer and inner radius; round joins soften the tips.
const SEAL_POINTS = Array.from({ length: 32 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 32 - Math.PI / 2
  const radius = i % 2 === 0 ? 11 : 9.6
  return `${(12 + radius * Math.cos(angle)).toFixed(2)},${(12 + radius * Math.sin(angle)).toFixed(2)}`
}).join(' ')

/** The verified mark: an accent-colored seal with a white check. */
export function VerifiedBadge({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      role="img"
      aria-label="Verified"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cx('inline-block shrink-0 align-[-0.125em]', className)}
    >
      <polygon points={SEAL_POINTS} fill="var(--accent)" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.6 12.3l3 3 5.8-6.3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
