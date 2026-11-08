import { cx } from '../lib/cx'

/** A small loading spinner. Inherits the text color. */
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      role="status"
      aria-label="Loading"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cx('animate-spin', className)}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** A spinner centered in a block, for whole sections that are loading. */
export function LoadingBlock({ className }: { className?: string }) {
  return (
    <div className={cx('flex justify-center py-10 text-muted', className)}>
      <Spinner size={26} />
    </div>
  )
}
