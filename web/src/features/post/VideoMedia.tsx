import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cx } from '../../lib/cx'
import type { Media } from '../../lib/types'
import { useInView } from './useInView'

interface VideoMediaProps {
  media: Media
  fit: 'cover' | 'contain'
  /** false for a carousel slide that is scrolled away: it pauses even if the post is on screen. */
  active?: boolean
}

/** A video in a post: plays muted on a loop while it is on screen, with a small mute toggle. */
export function VideoMedia({ media, fit, active = true }: VideoMediaProps) {
  const video = useRef<HTMLVideoElement>(null)
  const { ref, inView } = useInView(0.6)
  const [muted, setMuted] = useState(true)
  const playing = inView && active

  useEffect(() => {
    if (video.current) video.current.muted = muted
  }, [muted])

  useEffect(() => {
    const element = video.current
    if (!element) return
    // Browsers may refuse to autoplay; the poster frame stays up and nothing breaks.
    if (playing) element.play().catch(() => {})
    else element.pause()
  }, [playing])

  return (
    <div ref={ref} className="relative size-full bg-black">
      <video
        ref={video}
        src={media.url}
        poster={media.poster ?? undefined}
        muted
        loop
        playsInline
        preload="metadata"
        className={cx('size-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
      />
      <button
        type="button"
        aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        onClick={(event) => {
          event.stopPropagation()
          setMuted((value) => !value)
        }}
        className="absolute bottom-3 right-3 grid size-7 place-items-center rounded-full bg-black/65 text-white transition hover:bg-black/80"
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
    </div>
  )
}
