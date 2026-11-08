import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useOpenStoryComposer } from '../../app/navigation'
import { Avatar } from '../../components'
import { api } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useMe, useStore } from '../../lib/store'
import type { Me, StoryTray } from '../../lib/types'
import { useOpenStoryQueue } from './navigation'

/** Reload the stories tray (pull to refresh calls this too). */
export async function refreshTrays(): Promise<void> {
  useStore.getState().setTrays(await api.stories())
}

/**
 * The row of story bubbles at the top of the feed: "Your story" first (+ to add one), then people
 * with stories I haven't seen, then the ones I have. Scrolls sideways (arrows on desktop).
 */
export function StoriesTray() {
  const me = useMe()
  const trays = useStore((s) => s.trays)
  const openTray = useOpenStoryQueue()
  const openComposer = useOpenStoryComposer()
  const [loaded, setLoaded] = useState(trays.length > 0)
  const scroller = useRef<HTMLDivElement>(null)
  const [canScroll, setCanScroll] = useState({ left: false, right: false })

  useEffect(() => {
    let cancelled = false
    refreshTrays()
      .catch(() => {}) // the tray just stays as it was; "Your story" still works
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const mine = trays.find((tray) => tray.author.kind === 'me') ?? null
  const others = trays.filter((tray) => tray.author.kind !== 'me')
  const ordered = [...others.filter((tray) => !tray.allSeen), ...others.filter((tray) => tray.allSeen)]
  // The viewer walks through this order, so it carries on to the next bubble when one person finishes.
  const queue = [...(mine ? [me.username] : []), ...ordered.map((tray) => tray.author.username)]

  function updateArrows() {
    const element = scroller.current
    if (!element) return
    setCanScroll({
      left: element.scrollLeft > 4,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 4,
    })
  }
  useLayoutEffect(updateArrows, [trays.length, loaded])
  useEffect(() => {
    window.addEventListener('resize', updateArrows)
    return () => window.removeEventListener('resize', updateArrows)
  }, [])

  function scrollByPage(direction: 1 | -1) {
    const element = scroller.current
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.75, behavior: 'smooth' })
  }

  return (
    <section aria-label="Stories" className="relative border-b border-line md:mb-4 md:border-b-0">
      <div ref={scroller} onScroll={updateArrows} className="no-scrollbar flex gap-3 overflow-x-auto px-3 py-3 md:gap-4 md:px-0 md:py-2">
        <MyStoryBubble me={me} tray={mine} onView={() => openTray(me.username, queue)} onAdd={openComposer} />
        {loaded
          ? ordered.map((tray) => <TrayBubble key={tray.author.id} tray={tray} onOpen={() => openTray(tray.author.username, queue)} />)
          : Array.from({ length: 7 }, (_, i) => <BubbleSkeleton key={i} />)}
      </div>

      {canScroll.left && <TrayArrow side="left" onClick={() => scrollByPage(-1)} />}
      {canScroll.right && <TrayArrow side="right" onClick={() => scrollByPage(1)} />}
    </section>
  )
}

function TrayBubble({ tray, onOpen }: { tray: StoryTray; onOpen: () => void }) {
  const { username } = tray.author
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${username}'s story${tray.allSeen ? '' : ', not seen yet'}`}
      className="flex w-[68px] shrink-0 flex-col items-center gap-1 transition active:scale-95"
    >
      <Avatar account={tray.author} size={58} ring={tray.allSeen ? 'seen' : 'unseen'} />
      <span className={cx('w-full truncate text-center text-xs', tray.allSeen ? 'text-muted' : 'text-fg')}>{username}</span>
    </button>
  )
}

/** My bubble: tap to watch my story (or add one when I have none); the + always adds. */
function MyStoryBubble({ me, tray, onView, onAdd }: { me: Me; tray: StoryTray | null; onView: () => void; onAdd: () => void }) {
  return (
    <div className="relative flex w-[68px] shrink-0 flex-col items-center gap-1">
      <button type="button" onClick={tray ? onView : onAdd} aria-label={tray ? 'Your story' : 'Add to your story'} className="rounded-full transition active:scale-95">
        {tray ? (
          <Avatar account={me} size={58} ring={tray.allSeen ? 'seen' : 'unseen'} />
        ) : (
          // Same outer size as a ringed bubble, so all the names line up.
          <span className="block p-1">
            <Avatar account={me} size={58} />
          </span>
        )}
      </button>
      {/* With no story up, the avatar button already adds one, so screen readers skip this duplicate. */}
      <button
        type="button"
        aria-label="Add to your story"
        aria-hidden={tray ? undefined : true}
        tabIndex={tray ? undefined : -1}
        onClick={onAdd}
        className="absolute right-0.5 top-[46px] grid size-[22px] place-items-center rounded-full border-2 border-bg bg-accent text-white transition hover:bg-accent-hover"
      >
        <Plus size={13} strokeWidth={3} />
      </button>
      <span className="w-full truncate text-center text-xs text-muted">Your story</span>
    </div>
  )
}

function BubbleSkeleton() {
  return (
    <div aria-hidden className="flex w-[68px] shrink-0 flex-col items-center gap-1.5">
      <div className="shimmer size-[66px] rounded-full" />
      <div className="shimmer h-2.5 w-12 rounded-full" />
    </div>
  )
}

function TrayArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Earlier stories' : 'More stories'}
      onClick={onClick}
      className={cx(
        'absolute top-[26px] hidden size-7 place-items-center rounded-full bg-white/95 text-black shadow-pop transition hover:scale-105 md:grid',
        side === 'left' ? 'left-1' : 'right-1',
      )}
    >
      <Icon size={18} strokeWidth={2.25} />
    </button>
  )
}
