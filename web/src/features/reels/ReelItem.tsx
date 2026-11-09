/**
 * One reel, one screen tall: the video or photo reel, gestures (tap, double tap to like,
 * hold to pause), the caption overlay and the action buttons.
 */
import { Play, Volume2, VolumeX } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { HeartBurst } from '../../components'
import { api } from '../../lib/api'
import { useIsMobile } from '../../lib/hooks'
import { usePost, useStore } from '../../lib/store'
import { useReelWatch } from '../../lib/track'
import type { Post } from '../../lib/types'
import { CommentsSheet } from '../post'
import { MotionReel } from './MotionReel'
import { ReelActions } from './ReelActions'
import { ReelOverlay } from './ReelOverlay'
import { FRAME_MS } from './useReelClock'
import { useReelGestures } from './useReelGestures'
import { VideoReel } from './VideoReel'

/** A reel counts as viewed after this long on screen. */
const VIEW_AFTER_MS = 2000

interface ReelItemProps {
  post: Post
  /** This reel fills the screen right now. */
  active: boolean
  /** On screen or right next to it (its media should load). */
  near: boolean
  muted: boolean
  onToggleMute: () => void
}

export function ReelItem({ post: initial, active, near, muted, onToggleMute }: ReelItemProps) {
  const post = usePost(initial.id) ?? initial // live counts
  const isMobile = useIsMobile()
  const [paused, setPaused] = useState(false) // tapped to pause (photo reels)
  const [holding, setHolding] = useState(false) // pressed and held
  const [burst, setBurst] = useState(0)
  const [soundFlash, setSoundFlash] = useState(0) // shows the speaker icon after a tap
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [videoMs, setVideoMs] = useState<number | null>(null) // a video's length, once it has loaded
  const video = post.media.length === 1 && post.media[0].type === 'video' ? post.media[0] : null
  const playing = active && !paused && !holding

  useCountView(post.id, active)
  // Watch time for the recommendation algorithm; one play of a photo reel is its frames end to end.
  useReelWatch(post.id, active, video ? videoMs : post.media.length * FRAME_MS)

  // A reel you scroll away from plays again (unpaused) when you come back.
  useEffect(() => {
    if (!active) setPaused(false)
  }, [active])

  const gestures = useReelGestures({
    onDoubleTap: () => {
      setBurst((n) => n + 1)
      if (!post.likedByMe) useStore.getState().toggleLike(post) // double tap only ever likes
    },
    // Videos: tap toggles the sound. Photo reels have no sound: tap pauses instead.
    onTap: video
      ? () => {
          onToggleMute()
          setSoundFlash((n) => n + 1)
        }
      : () => setPaused((value) => !value),
    onHoldChange: setHolding,
  })

  return (
    <section aria-label={`Reel by ${post.author.username}`} className="flex h-full snap-start snap-always items-center justify-center md:gap-5 md:py-5">
      <div className="relative h-full w-full overflow-hidden bg-black md:aspect-[9/16] md:w-auto md:max-w-full md:rounded-xl">
        <div className="absolute inset-0 select-none" {...gestures}>
          {video ? (
            <VideoReel media={video} active={active} playing={playing} muted={muted} near={near} onLength={setVideoMs} />
          ) : (
            <MotionReel frames={post.media} active={active} playing={playing} near={near} />
          )}
        </div>

        <HeartBurst trigger={burst} size={110} />
        <CenterIcons paused={paused && active} muted={muted} soundFlash={video ? soundFlash : 0} />

        <ReelOverlay post={post} running={playing} hidden={holding} besideRail={isMobile} />
        {isMobile && (
          <div className="absolute bottom-5 right-1.5 z-10">
            <ReelActions post={post} layout="overlay" onComments={() => setCommentsOpen(true)} />
          </div>
        )}
      </div>

      {!isMobile && (
        <div className="self-end pb-2">
          <ReelActions post={post} layout="side" onComments={() => setCommentsOpen(true)} />
        </div>
      )}
      <CommentsSheet post={post} open={commentsOpen} onClose={() => setCommentsOpen(false)} size="md" />
    </section>
  )
}

/** Counts a view once the reel has been on screen for 2 seconds (once per visit to the page). */
function useCountView(postId: string, active: boolean) {
  const counted = useRef(false)
  useEffect(() => {
    if (!active || counted.current) return
    const timer = window.setTimeout(() => {
      counted.current = true
      api.viewPost(postId).catch(() => {}) // the new count arrives as a live post.stats event
    }, VIEW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [active, postId])
}

/** The big play icon while a photo reel is paused, and a quick speaker icon after tapping a video. */
function CenterIcons({ paused, muted, soundFlash }: { paused: boolean; muted: boolean; soundFlash: number }) {
  const [flashing, setFlashing] = useState(0)
  useEffect(() => {
    if (soundFlash === 0) return
    setFlashing(soundFlash)
    const timer = window.setTimeout(() => setFlashing(0), 700)
    return () => window.clearTimeout(timer)
  }, [soundFlash])

  const icon = paused ? <Play size={34} fill="currentColor" className="translate-x-0.5" /> : muted ? <VolumeX size={30} /> : <Volume2 size={30} />
  const visible = paused || flashing > 0
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={paused ? 'paused' : `sound-${flashing}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.18 }}
        >
          <span className="grid size-[72px] place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">{icon}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
