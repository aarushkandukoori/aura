/**
 * A photo reel: its pictures play full screen one after another. Each one slowly zooms and pans
 * (a "Ken Burns" move) and cross-fades into the next, with a thin progress bar at the bottom.
 */
import { useReducedMotion } from 'motion/react'
import { useEffect, useEffectEvent, useRef, type RefObject } from 'react'
import { Img } from '../../components'
import { cx } from '../../lib/cx'
import type { Media } from '../../lib/types'
import { FRAME_MS, useReelClock } from './useReelClock'

/** The cross-fade between pictures (matches duration-700 below). */
const FADE_MS = 700

/** A few different slow moves, so consecutive pictures don't all drift the same way. */
const MOVES: Keyframe[][] = [
  [{ transform: 'scale(1.04) translate(0%, 0%)' }, { transform: 'scale(1.16) translate(-2%, -2.5%)' }],
  [{ transform: 'scale(1.16) translate(2%, 1.5%)' }, { transform: 'scale(1.04) translate(0%, 0%)' }],
  [{ transform: 'scale(1.08) translate(-2.5%, 2%)' }, { transform: 'scale(1.15) translate(2%, -1%)' }],
]

interface MotionReelProps {
  frames: Media[]
  /** This reel fills the screen. */
  active: boolean
  /** Active and not paused or held. */
  playing: boolean
  /** On screen or next to it: load every picture (otherwise just the first, as a cover). */
  near: boolean
}

export function MotionReel({ frames, active, playing, near }: MotionReelProps) {
  const { step, bar } = useReelClock(frames.length, active, playing)
  const current = frames.length > 0 ? step % frames.length : 0
  const shown = near ? frames : frames.slice(0, 1)

  return (
    <>
      {shown.map((media, index) => (
        <KenBurnsFrame
          key={index}
          src={media.type === 'video' ? media.poster ?? null : media.url}
          move={MOVES[index % MOVES.length]}
          current={index === current}
          step={step}
          active={active}
          playing={playing}
          eager={near}
        />
      ))}
      <ProgressBar barRef={bar} />
    </>
  )
}

interface KenBurnsFrameProps {
  src: string | null
  move: Keyframe[]
  current: boolean
  /** Changes every time a new frame comes up (so a one-picture reel restarts its move each loop). */
  step: number
  active: boolean
  playing: boolean
  eager: boolean
}

function KenBurnsFrame({ src, move, current, step, active, playing, eager }: KenBurnsFrameProps) {
  const box = useRef<HTMLDivElement>(null)
  const animation = useRef<Animation | null>(null)
  const reduceMotion = useReducedMotion()
  const isPlaying = useEffectEvent(() => playing)

  // Each time this picture comes up, its slow move starts over. The move lasts a little longer
  // than the picture is shown, so it keeps drifting while it fades out.
  useEffect(() => {
    const element = box.current
    if (!current || !element || reduceMotion) return
    animation.current?.cancel()
    const next = element.animate(move, { duration: FRAME_MS + FADE_MS, easing: 'ease-out', fill: 'forwards' })
    if (!isPlaying()) next.pause()
    animation.current = next
  }, [current, step, active, move, reduceMotion])

  // Holding or pausing the reel freezes the move too.
  useEffect(() => {
    const running = animation.current
    if (!running || running.playState === 'finished') return
    if (playing) running.play()
    else running.pause()
  }, [playing])

  return (
    <div className={cx('absolute inset-0 transition-opacity duration-700 ease-out', current ? 'opacity-100' : 'opacity-0')}>
      <div ref={box} className="size-full will-change-transform">
        <Img src={src} alt="" className="size-full" loading={eager ? 'eager' : 'lazy'} />
      </div>
    </div>
  )
}

/** The thin line along the bottom of a reel. Its width is set through the ref (see useReelClock). */
export function ProgressBar({ barRef }: { barRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[3px] bg-white/25">
      <div ref={barRef} className="h-full origin-left bg-white/90" style={{ transform: 'scaleX(0)' }} />
    </div>
  )
}
