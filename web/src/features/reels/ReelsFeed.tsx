/**
 * The reels feed: a full-height column of reels that snaps one reel at a time. Only the reel on
 * screen plays; it and its neighbours load their media (so the next one is ready before you
 * swipe). Arrow keys and the buttons on the right move between reels on desktop.
 */
import { Camera, ChevronDown, ChevronUp, Clapperboard } from 'lucide-react'
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useOpenCreate } from '../../app/navigation'
import { Button, IconButton, Spinner } from '../../components'
import { api } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useIsMobile } from '../../lib/hooks'
import { usePostList } from '../../lib/lists'
import { ReelItem } from './ReelItem'

/** The reel you were on, per list, so coming back to Reels returns to it. */
const lastIndex = new Map<string, number>()

export function ReelsFeed({ startId }: { startId: string | null }) {
  const listKey = startId ? `reels:${startId}` : 'reels'
  const reels = usePostList(listKey, (cursor) => api.reels(cursor, startId))
  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(() => lastIndex.get(listKey) ?? 0)
  const [muted, setMuted] = useState(true) // the sound setting carries over from reel to reel
  const isMobile = useIsMobile()
  const openCreate = useOpenCreate()
  const count = reels.posts.length

  // Return to the saved reel (the list itself is cached, so it is already there).
  useLayoutEffect(() => {
    const element = scroller.current
    if (element && active > 0) element.scrollTop = active * element.clientHeight
  }, []) // only on the first render: after that, scrolling decides which reel is active

  // Opening Reels at the top shows the newest ones, including any posted since the list was cached
  // (like the reel you just shared).
  const { refresh } = reels
  useEffect(() => {
    if (!startId && active === 0 && count > 0) refresh()
  }, []) // only when the page opens

  // Every reel is exactly one screen tall, so the scroll position tells which one is showing.
  function onScroll() {
    const element = scroller.current
    if (!element || element.clientHeight === 0) return
    const index = Math.round(element.scrollTop / element.clientHeight)
    setActive(index)
    lastIndex.set(listKey, index)
  }

  function goTo(index: number) {
    const element = scroller.current
    element?.scrollTo({ top: Math.max(0, index) * element.clientHeight, behavior: 'smooth' })
  }

  // Load the next page while there are still a few reels left to watch.
  const { loadMore } = reels
  useEffect(() => {
    if (count > 0 && active >= count - 3) loadMore()
  }, [active, count, loadMore])

  // Arrow keys on desktop (ignored while typing or while a dialog is open).
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, [contenteditable="true"]') || document.querySelector('[aria-modal="true"]')) return
    event.preventDefault()
    goTo(active + (event.key === 'ArrowDown' ? 1 : -1))
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <div className={cx('relative', isMobile ? 'dark bg-black text-white' : 'bg-bg')}>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="no-scrollbar h-[calc(100dvh-var(--tabbar-h))] snap-y snap-mandatory overflow-y-scroll overscroll-contain"
      >
        {reels.posts.map((post, index) => (
          <ReelItem
            key={post.id}
            post={post}
            active={index === active}
            near={Math.abs(index - active) <= 1}
            muted={muted}
            onToggleMute={() => setMuted((value) => !value)}
          />
        ))}

        {reels.loading ? (
          <FullScreen snap={false}>
            <Spinner size={30} />
          </FullScreen>
        ) : reels.error && count === 0 ? (
          <FullScreen>
            <p className="text-sm text-muted">{reels.error}</p>
            <Button variant="secondary" onClick={() => reels.refresh()}>Try again</Button>
          </FullScreen>
        ) : count === 0 ? (
          <FullScreen>
            <Clapperboard size={44} strokeWidth={1.25} />
            <p className="text-xl font-bold">No reels yet</p>
            <p className="max-w-xs text-sm text-muted">When people share reels, they'll play here.</p>
            <Button onClick={openCreate}>Create a reel</Button>
          </FullScreen>
        ) : reels.error ? (
          <FullScreen>
            <p className="text-sm text-muted">{reels.error}</p>
            <Button variant="secondary" onClick={reels.loadMore}>Try again</Button>
          </FullScreen>
        ) : reels.done ? (
          <FullScreen>
            <p className="text-xl font-bold">You're all caught up</p>
            <p className="max-w-xs text-sm text-muted">You've watched all the latest reels.</p>
            <Button variant="secondary" onClick={() => goTo(0)}>Watch again</Button>
          </FullScreen>
        ) : (
          <FullScreen snap={false}>
            <Spinner size={30} />
          </FullScreen>
        )}
      </div>

      {/* Phones: the page title and a camera button float over the top of the reels. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between pl-4 pr-1.5 pt-safe md:hidden">
        <h1 className="text-[22px] font-bold text-white drop-shadow-[0_1px_4px_rgb(0_0_0/0.4)]">Reels</h1>
        <IconButton label="Create" size="lg" onClick={openCreate} className="pointer-events-auto text-white drop-shadow-[0_1px_4px_rgb(0_0_0/0.4)]">
          <Camera size={26} strokeWidth={1.75} />
        </IconButton>
      </div>

      {/* Desktop: up/down buttons on the right edge. */}
      {count > 0 && (
        <div className="absolute right-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 md:flex">
          <IconButton label="Previous reel" size="lg" variant="soft" disabled={active === 0} onClick={() => goTo(active - 1)} className="bg-surface">
            <ChevronUp size={24} />
          </IconButton>
          <IconButton label="Next reel" size="lg" variant="soft" disabled={active >= count} onClick={() => goTo(active + 1)} className="bg-surface">
            <ChevronDown size={24} />
          </IconButton>
        </div>
      )}
    </div>
  )
}

/**
 * A screen-tall slot after the reels for loading, empty and "all caught up" states.
 * Loading slots are not snap points: the browser keeps a snapped element in view when content is
 * added before it, so a snapped spinner would drag the feed to its end when the reels arrive.
 */
function FullScreen({ snap = true, children }: { snap?: boolean; children: ReactNode }) {
  return <div className={cx('flex h-full flex-col items-center justify-center gap-3 px-8 text-center', snap && 'snap-start')}>{children}</div>
}
