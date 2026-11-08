import { Camera, Check } from 'lucide-react'
import { Link } from 'react-router'
import { Button, buttonClasses, EmptyState, LogoMark } from '../../components'
import { cx } from '../../lib/cx'
import { PULL_THRESHOLD } from './usePullToRefresh'

/** Grey placeholder posts with a shimmer while the first page of the feed loads. */
export function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading posts">
      {[0, 1].map((i) => (
        <div key={i} aria-hidden className="pb-6">
          <div className="flex items-center gap-3 px-3 py-3 md:px-0">
            <div className="shimmer size-8 rounded-full" />
            <div className="shimmer h-3 w-32 rounded-full" />
          </div>
          <div className="shimmer aspect-[4/5] w-full md:rounded-[4px]" />
          <div className="space-y-2 px-3 pt-3 md:px-0">
            <div className="shimmer h-3 w-24 rounded-full" />
            <div className="shimmer h-3 w-3/4 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The marker after the last post from people I follow; suggested posts continue below it.
 * `since` is the oldest of those posts, for "from the past 3 days".
 */
export function CaughtUp({ since, moreBelow }: { since: number; moreBelow: boolean }) {
  const days = Math.max(1, Math.ceil((Date.now() - since) / 86_400_000))
  return (
    <>
      <div className="flex flex-col items-center border-b border-line px-6 py-10 text-center">
        <span className="story-ring grid size-[68px] place-items-center p-[3px]">
          <span className="grid size-full place-items-center rounded-full bg-bg">
            <Check size={30} strokeWidth={2.25} />
          </span>
        </span>
        <h2 className="mt-4 text-lg font-semibold">You're all caught up</h2>
        <p className="mt-1 text-sm text-muted">
          {days <= 7 ? `You've seen all new posts from the past ${days} ${days === 1 ? 'day' : 'days'}.` : "You've seen all new posts from people you follow."}
        </p>
      </div>
      {moreBelow && <h2 className="px-3 pb-1 pt-5 text-base font-semibold md:px-0">Suggested posts</h2>}
    </>
  )
}

export function EmptyFeed() {
  return (
    <EmptyState
      icon={<Camera size={30} strokeWidth={1.5} />}
      title="Welcome to Aura"
      body="When people you follow share photos and reels, you'll see them here."
      action={
        <Link to="/explore" className={buttonClasses()}>
          Find people
        </Link>
      }
    />
  )
}

export function FeedError({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center gap-3 text-center text-sm text-muted', compact ? 'py-6' : 'py-16')}>
      <p>{compact ? "Couldn't load more posts." : "Couldn't load your feed."}</p>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

/** The glowing ring that appears as you pull the feed down, and spins while it refreshes (phones). */
export function PullIndicator({ distance, pulling, refreshing }: { distance: number; pulling: boolean; refreshing: boolean }) {
  const height = refreshing ? 56 : distance
  return (
    <div
      aria-hidden={!refreshing}
      role={refreshing ? 'status' : undefined}
      aria-label={refreshing ? 'Refreshing' : undefined}
      className={cx('flex items-end justify-center overflow-hidden md:hidden', !pulling && 'transition-[height] duration-200')}
      style={{ height }}
    >
      <span
        className={cx('mb-3 grid', refreshing && 'animate-spin')}
        style={refreshing ? undefined : { transform: `rotate(${distance * 4}deg) scale(${Math.min(1, distance / PULL_THRESHOLD)})` }}
      >
        <LogoMark size={28} />
      </span>
    </div>
  )
}
