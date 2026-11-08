import { useEffect, useRef, useState } from 'react'
import { cx } from '../lib/cx'
import { formatNumber } from '../lib/format'
import { useMediaQuery } from '../lib/hooks'

interface CountUpProps {
  value: number
  /** How to print the number (default 1,234). Pass formatCount for 12.4K style. */
  format?: (n: number) => string
  className?: string
  /** Animation length in ms. */
  duration?: number
}

/**
 * A number that rolls to its new value when it changes, for live counters (likes, followers, views).
 * The first render shows the value as is; only later changes animate.
 */
export function CountUp({ value, format = formatNumber, className, duration = 700 }: CountUpProps) {
  const [shown, setShown] = useState(value)
  const shownRef = useRef(value)
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  useEffect(() => {
    const from = shownRef.current
    if (from === value) return
    if (reduceMotion) {
      shownRef.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3) // fast at first, gentle at the end
      shownRef.current = Math.round(from + (value - from) * eased)
      setShown(shownRef.current)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, duration, reduceMotion])

  return <span className={cx('tabular-nums', className)}>{format(shown)}</span>
}
