import { Img } from '../../components'
import { cx } from '../../lib/cx'
import type { Media } from '../../lib/types'
import { VideoMedia } from './VideoMedia'

interface MediaItemProps {
  media: Media
  /** cover fills the box (feed); contain shows the whole picture on black (post detail). */
  fit: 'cover' | 'contain'
  alt: string
  active?: boolean
}

/** One photo or video filling its box. Missing pictures shimmer, then show a soft placeholder. */
export function MediaItem({ media, fit, alt, active = true }: MediaItemProps) {
  if (media.type === 'video') return <VideoMedia media={media} fit={fit} active={active} />
  return <Img src={media.url} alt={alt} fit={fit} className={cx('size-full', fit === 'contain' && 'bg-black!')} />
}
