import { useEffect, useEffectEvent, useRef } from 'react'

interface StoryProgressProps {
  count: number
  index: number
  /** How long the current story lasts (ms). */
  duration: number
  paused: boolean
  /** Changes whenever the current bar must start from zero (a new story, or the same one replayed). */
  playKey: string
  /** The current bar filled up. */
  onDone: () => void
}

/**
 * The thin bars at the top of a story, one per story. The current bar fills over `duration`
 * using the browser's animation API, which can pause and resume exactly where it was (holding a
 * finger on the story) and tells us when it is done.
 */
export function StoryProgress({ count, index, duration, paused, playKey, onDone }: StoryProgressProps) {
  const bar = useRef<HTMLDivElement>(null)
  const animation = useRef<Animation | null>(null)
  const finished = useEffectEvent(onDone)

  useEffect(() => {
    const element = bar.current
    if (!element) return
    const fill = element.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration, easing: 'linear', fill: 'forwards' })
    fill.onfinish = () => finished()
    animation.current = fill
    return () => fill.cancel()
  }, [playKey, duration])

  useEffect(() => {
    if (paused) animation.current?.pause()
    else animation.current?.play()
  }, [paused, playKey, duration])

  return (
    <div className="flex gap-1" role="progressbar" aria-label="Story progress" aria-valuemin={1} aria-valuemax={count} aria-valuenow={index + 1}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/35">
          <div
            ref={i === index ? bar : undefined}
            className="h-full origin-left rounded-full bg-white"
            style={{ transform: i < index ? 'scaleX(1)' : 'scaleX(0)' }}
          />
        </div>
      ))}
    </div>
  )
}
