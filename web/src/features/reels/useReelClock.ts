import { useEffect, useRef, useState } from 'react'

/** How long each picture of a photo reel stays up. */
export const FRAME_MS = 2500

/**
 * The clock of a photo reel. While `playing`, time moves forward (frame by frame, looping);
 * paused, it stands still; when the reel stops being `active` it rewinds to the start.
 *
 * Returns `step` (how many frames have been shown so far, counting loops) and a ref for the
 * progress bar. The bar's width is set directly on the element 60 times a second, so the reel
 * itself only re-renders when the frame changes.
 */
export function useReelClock(frameCount: number, active: boolean, playing: boolean) {
  const [step, setStep] = useState(0)
  const elapsed = useRef(0)
  const bar = useRef<HTMLDivElement>(null)

  // Scrolling away rewinds the reel so it starts from the first picture next time.
  useEffect(() => {
    if (active) return
    elapsed.current = 0
    setStep(0)
    if (bar.current) bar.current.style.transform = 'scaleX(0)'
  }, [active])

  useEffect(() => {
    if (!playing || frameCount === 0) return
    const total = FRAME_MS * frameCount
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      elapsed.current += now - last
      last = now
      setStep(Math.floor(elapsed.current / FRAME_MS)) // React ignores it when the number is unchanged
      if (bar.current) bar.current.style.transform = `scaleX(${(elapsed.current % total) / total})`
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, frameCount])

  return { step, bar }
}
