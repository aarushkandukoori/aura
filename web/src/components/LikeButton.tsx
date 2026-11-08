import { Heart } from 'lucide-react'
import { useState } from 'react'
import { cx } from '../lib/cx'

interface LikeButtonProps {
  liked: boolean
  onToggle: () => void
  /** Icon size in px (24 in post action bars, 14 on comments, 28 on reels). */
  size?: number
  className?: string
}

/** The heart: outline when not liked, filled pink when liked, with a little bounce when you like. */
export function LikeButton({ liked, onToggle, size = 24, className }: LikeButtonProps) {
  // Bumping the key remounts the icon, which replays the pop animation (only on my own like taps).
  const [popKey, setPopKey] = useState(0)
  return (
    <button
      type="button"
      aria-label={liked ? 'Unlike' : 'Like'}
      aria-pressed={liked}
      onClick={(event) => {
        event.stopPropagation()
        if (!liked) setPopKey((key) => key + 1)
        onToggle()
      }}
      className={cx('inline-grid shrink-0 place-items-center transition-opacity hover:opacity-60', className)}
    >
      <span key={popKey} className={cx('grid', popKey > 0 && liked && 'animate-pop')}>
        <Heart
          size={size}
          strokeWidth={1.9}
          fill={liked ? 'var(--like)' : 'none'}
          color={liked ? 'var(--like)' : 'currentColor'}
        />
      </span>
    </button>
  )
}
