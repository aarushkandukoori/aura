import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useEffectEvent, useState } from 'react'
import { cx } from '../../lib/cx'
import { useEscapeKey } from '../../lib/hooks'
import { useStore } from '../../lib/store'
import type { ID, Story } from '../../lib/types'
import { useHeldFor, usePageVisible } from './hooks'
import { MyStoryFooter } from './MyStoryFooter'
import { StoryHeader, type HighlightInfo } from './StoryHeader'
import { StoryMedia } from './StoryMedia'
import { StoryProgress } from './StoryProgress'
import { StoryReplyBar } from './StoryReplyBar'
import { STORY_CARD, StoryStage } from './StoryStage'
import { useStoryGestures } from './useStoryGestures'

/** How long a picture story stays up. */
const PICTURE_MS = 5000

export interface StoryViewerProps {
  stories: Story[]
  startIndex: number
  /** Highlights show their title and cover instead of the person. */
  highlight?: HighlightInfo | null
  /** Mark each story seen as it plays (not for highlights). */
  markSeen?: boolean
  onClose: () => void
  /** Go on to the next / previous person. Without them the viewer closes at the end and replays at the start. */
  onNextTray?: () => void
  onPrevTray?: () => void
}

/**
 * Plays one person's stories (or a highlight): progress bars, 5 s per picture, tap left/right,
 * hold to pause, arrow keys, Escape or swipe down to close, swipe sideways for the next person.
 * Other people's stories get a reply box; mine show who has seen them.
 */
export function StoryViewer({ stories: allStories, startIndex, highlight = null, markSeen = false, onClose, onNextTray, onPrevTray }: StoryViewerProps) {
  const [index, setIndex] = useState(startIndex)
  const [replay, setReplay] = useState(0) // bumped to play the current story again from the start
  const [removedIds, setRemovedIds] = useState<ReadonlySet<ID>>(() => new Set()) // my stories deleted here
  const [readyId, setReadyId] = useState<ID | null>(null) // whose picture has finished loading
  const [videoLength, setVideoLength] = useState<{ id: ID; ms: number } | null>(null)
  const [holding, setHolding] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const [busy, setBusy] = useState(false) // typing a reply, or a sheet / dialog is open
  const pageVisible = usePageVisible()
  const markStorySeen = useStore((s) => s.markStorySeen)

  const stories = allStories.filter((story) => !removedIds.has(story.id))
  const current = Math.min(index, stories.length - 1)
  const story = stories[current]
  const paused = holding || userPaused || busy || !pageVisible || readyId !== story?.id
  const duration = story?.media.type === 'video' && videoLength?.id === story.id ? videoLength.ms : PICTURE_MS
  const chromeHidden = useHeldFor(holding, 250) // hold the story to see it without the header and reply box

  function goNext() {
    if (current < stories.length - 1) setIndex(current + 1)
    else (onNextTray ?? onClose)()
  }

  function goPrev() {
    if (current > 0) setIndex(current - 1)
    else if (onPrevTray) onPrevTray()
    else setReplay((n) => n + 1)
  }

  function afterDelete(storyId: ID) {
    if (stories.length === 1) return onClose()
    setRemovedIds((ids) => new Set(ids).add(storyId))
    if (current === stories.length - 1) setIndex(current - 1)
  }

  useEffect(() => {
    if (story && markSeen && !story.seen) markStorySeen(story.id)
  }, [story, markSeen, markStorySeen])

  // Start loading the next picture now, so it appears instantly.
  const nextUrl = stories[current + 1]?.media.type === 'image' ? stories[current + 1].media.url : null
  useEffect(() => {
    if (nextUrl) new Image().src = nextUrl
  }, [nextUrl])

  useEscapeKey(onClose)
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    if (busy || target?.closest('input, textarea')) return
    if (event.key === 'ArrowRight') goNext()
    else if (event.key === 'ArrowLeft') goPrev()
    else if (event.key === ' ') {
      event.preventDefault()
      setUserPaused((value) => !value)
    }
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const gestures = useStoryGestures({
    onTapLeft: goPrev,
    onTapRight: goNext,
    onSwipeLeft: () => (onNextTray ?? onClose)(),
    onSwipeRight: () => onPrevTray?.(),
    onSwipeDown: onClose,
    onHoldChange: setHolding,
  })

  if (!story) return null
  const isMine = story.author.kind === 'me'
  const hasPrev = current > 0 || Boolean(onPrevTray)
  const hasNext = current < stories.length - 1 || Boolean(onNextTray)

  return (
    <StoryStage onClose={onClose} pull={gestures.pull}>
      <SideArrow side="left" hidden={!hasPrev} onClick={goPrev} />

      <div
        className={STORY_CARD}
        style={gestures.pull ? { transform: `translateY(${gestures.pull}px) scale(${1 - gestures.pull / 2000})`, borderRadius: 16 } : undefined}
      >
        <motion.div className="absolute inset-0" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
          <StoryMedia
            key={story.id}
            story={story}
            paused={paused}
            onReady={() => setReadyId(story.id)}
            onVideoDuration={(ms) => setVideoLength({ id: story.id, ms })}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-black/55 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-black/60 to-transparent" />

          {/* Tap / hold / swipe layer over the picture. */}
          <div className="absolute inset-0 touch-none select-none" {...gestures.handlers} />

          <div className={cx('absolute inset-x-0 top-0 px-2.5 pt-[max(env(safe-area-inset-top),10px)] transition-opacity duration-200', chromeHidden && 'opacity-0')}>
            <StoryProgress count={stories.length} index={current} duration={duration} paused={paused} playKey={`${story.id}:${replay}`} onDone={goNext} />
            <StoryHeader story={story} highlight={highlight} paused={userPaused} onTogglePause={() => setUserPaused((value) => !value)} onClose={onClose} />
          </div>

          <div className={cx('absolute inset-x-0 bottom-0 transition-opacity duration-200', chromeHidden && 'pointer-events-none opacity-0')}>
            {isMine ? (
              <MyStoryFooter key={story.id} story={story} onBusyChange={setBusy} onDeleted={() => afterDelete(story.id)} />
            ) : (
              <StoryReplyBar story={story} onBusyChange={setBusy} />
            )}
          </div>
        </motion.div>
      </div>

      <SideArrow side="right" hidden={!hasNext} onClick={goNext} />
    </StoryStage>
  )
}

/** Round previous / next buttons beside the card (desktop). Hidden ones keep their space so the card stays centered. */
function SideArrow({ side, hidden, onClick }: { side: 'left' | 'right'; hidden: boolean; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Previous story' : 'Next story'}
      onClick={onClick}
      tabIndex={hidden ? -1 : undefined}
      className={cx(
        'hidden size-8 shrink-0 place-items-center rounded-full bg-white/90 text-black shadow transition hover:bg-white md:grid',
        hidden && 'md:invisible',
      )}
    >
      <Icon size={20} strokeWidth={2.25} />
    </button>
  )
}
