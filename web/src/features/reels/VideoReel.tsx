import { useEffect, useRef } from 'react'
import { cx } from '../../lib/cx'
import type { Media } from '../../lib/types'
import { ProgressBar } from './MotionReel'

interface VideoReelProps {
  media: Media
  active: boolean
  playing: boolean
  muted: boolean
  /** On screen or next to it: load the video (far-away reels only keep their poster). */
  near: boolean
}

/** A video reel: plays on a loop while on screen, muted until you tap to turn the sound on. */
export function VideoReel({ media, active, playing, muted, near }: VideoReelProps) {
  const video = useRef<HTMLVideoElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  // Landscape videos are shown whole (letterboxed) instead of cropped to a sliver.
  const landscape = (media.width ?? 0) > (media.height ?? 0)

  // Set as a property: React doesn't keep the `muted` attribute in sync after the first render.
  useEffect(() => {
    if (video.current) video.current.muted = muted
  }, [muted])

  useEffect(() => {
    const element = video.current
    if (!element) return
    if (playing) element.play().catch(() => {}) // the browser may refuse; the poster stays up
    else element.pause()
  }, [playing, near])

  // Scrolling away rewinds it, so it starts from the beginning next time.
  useEffect(() => {
    if (!active && video.current) video.current.currentTime = 0
  }, [active])

  // Move the progress bar smoothly while playing.
  useEffect(() => {
    if (!playing) return
    let frame = requestAnimationFrame(function tick() {
      const element = video.current
      if (element && bar.current && element.duration) {
        bar.current.style.transform = `scaleX(${element.currentTime / element.duration})`
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing])

  return (
    <>
      <video
        ref={video}
        src={near ? media.url : undefined}
        poster={media.poster ?? undefined}
        loop
        playsInline
        preload={near ? 'auto' : 'none'}
        className={cx('absolute inset-0 size-full bg-black', landscape ? 'object-contain' : 'object-cover')}
      />
      <ProgressBar barRef={bar} />
    </>
  )
}
