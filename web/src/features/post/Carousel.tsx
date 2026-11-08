import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef } from 'react'
import { cx } from '../../lib/cx'
import type { Media } from '../../lib/types'
import { MediaItem } from './MediaItem'

interface CarouselProps {
  media: Media[]
  index: number
  onIndexChange: (index: number) => void
  fit: 'cover' | 'contain'
  alt: string
}

/**
 * Several photos side by side. The strip is a native horizontal scroller with snap points, so
 * swiping on a phone feels exactly like the system; desktop gets arrow buttons.
 * The parent keeps `index` so it can draw the dots elsewhere (under the post in the feed).
 */
export function Carousel({ media, index, onIndexChange, fit, alt }: CarouselProps) {
  const strip = useRef<HTMLDivElement>(null)

  // Whatever slide is centered after a swipe (or an arrow click) becomes the index.
  function onScroll() {
    const element = strip.current
    if (!element || element.clientWidth === 0) return
    const visible = Math.round(element.scrollLeft / element.clientWidth)
    if (visible !== index) onIndexChange(visible)
  }

  function goTo(target: number) {
    const element = strip.current
    if (element) element.scrollTo({ left: target * element.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="relative size-full">
      <div ref={strip} onScroll={onScroll} className="no-scrollbar flex size-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {media.map((item, i) => (
          <div key={item.url + i} className="relative size-full shrink-0 snap-center snap-always">
            <MediaItem media={item} fit={fit} alt={`${alt} (${i + 1} of ${media.length})`} active={i === index} />
          </div>
        ))}
      </div>

      {index > 0 && <SlideArrow direction="previous" onClick={() => goTo(index - 1)} />}
      {index < media.length - 1 && <SlideArrow direction="next" onClick={() => goTo(index + 1)} />}

      {/* "2/3" shows up whenever the slide changes, then fades away. */}
      <motion.span
        key={index}
        aria-hidden
        className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/65 px-2 py-0.5 text-xs font-semibold text-white"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ delay: 2.2, duration: 0.4 }}
      >
        {index + 1}/{media.length}
      </motion.span>
    </div>
  )
}

function SlideArrow({ direction, onClick }: { direction: 'previous' | 'next'; onClick: () => void }) {
  const Icon = direction === 'next' ? ChevronRight : ChevronLeft
  return (
    <button
      type="button"
      aria-label={direction === 'next' ? 'Next photo' : 'Previous photo'}
      onClick={(event) => {
        event.stopPropagation() // not part of a double tap on the photo
        onClick()
      }}
      className={cx(
        'absolute top-1/2 hidden size-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black shadow-md transition hover:bg-white md:grid',
        direction === 'next' ? 'right-3' : 'left-3',
      )}
    >
      <Icon size={18} strokeWidth={2.25} />
    </button>
  )
}

/** The little dots that show which photo of a carousel you are on. */
export function CarouselDots({ count, index, onMedia = false, className }: { count: number; index: number; onMedia?: boolean; className?: string }) {
  return (
    <div aria-hidden className={cx('flex items-center gap-1', className)}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cx(
            'size-1.5 rounded-full transition-colors duration-200',
            onMedia ? (i === index ? 'bg-white' : 'bg-white/45') : i === index ? 'bg-accent' : 'bg-line-strong',
          )}
        />
      ))}
    </div>
  )
}
