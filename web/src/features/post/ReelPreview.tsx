import { Clapperboard } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Img } from '../../components'
import type { Post } from '../../lib/types'
import { useInView } from './useInView'
import { VideoMedia } from './VideoMedia'

/** How long each picture of a photo reel stays up before cross-fading to the next. */
const FRAME_MS = 2600
const FADE_S = 0.9
/** Each frame zooms toward a different spot, so the slow zoom feels like a camera move. */
const ZOOM_ORIGINS = ['50% 35%', '35% 60%', '65% 45%']

/**
 * A reel inside a post card. Uploaded reels are a video (muted autoplay). AI reels are a few
 * pictures, played here as a short "motion" preview: a slow zoom and a cross-fade between frames,
 * only while the card is on screen. The badge marks it as a reel (the header shows its audio).
 */
export function ReelPreview({ post, fit }: { post: Post; fit: 'cover' | 'contain' }) {
  const { ref, inView } = useInView(0.5)
  const video = post.media.find((item) => item.type === 'video')
  const frames = post.media.filter((item) => item.type === 'image')
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (!inView || frames.length < 2) return
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % frames.length), FRAME_MS)
    return () => window.clearInterval(timer)
  }, [inView, frames.length])

  return (
    <div ref={ref} className="relative size-full overflow-hidden bg-black">
      {video ? (
        <VideoMedia media={video} fit={fit} />
      ) : (
        // Every frame stays mounted (so the next one is already loaded); only the current one is visible.
        frames.map((item, i) => {
          const current = i === frame
          return (
            <motion.div
              key={item.url + i}
              className="absolute inset-0"
              style={{ transformOrigin: ZOOM_ORIGINS[i % ZOOM_ORIGINS.length] }}
              initial={{ opacity: i === 0 ? 1 : 0, scale: 1 }}
              animate={current ? { opacity: 1, scale: 1.12 } : { opacity: 0, scale: 1 }}
              transition={
                current
                  ? { opacity: { duration: FADE_S }, scale: { duration: FRAME_MS / 1000 + FADE_S, ease: 'linear' } }
                  : { opacity: { duration: FADE_S }, scale: { duration: 0, delay: FADE_S } } // reset the zoom once hidden
              }
            >
              <Img src={item.url} alt={`Reel by ${post.author.username}`} fit={fit} className="size-full" />
            </motion.div>
          )
        })
      )}

      <span className="pointer-events-none absolute right-3 top-3 text-white drop-shadow-[0_1px_3px_rgb(0_0_0/0.5)]" aria-label="Reel">
        <Clapperboard size={20} strokeWidth={2} />
      </span>
    </div>
  )
}
