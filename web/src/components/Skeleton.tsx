import { cx } from '../lib/cx'

/**
 * A shimmering placeholder block shown while content loads.
 * Size it with classes: <Skeleton className="h-4 w-32" /> or <Skeleton circle className="size-11" />.
 */
export function Skeleton({ className, circle = false }: { className?: string; circle?: boolean }) {
  return <div aria-hidden className={cx('shimmer', circle ? 'rounded-full' : 'rounded-md', className)} />
}
