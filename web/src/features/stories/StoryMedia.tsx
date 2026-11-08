import { useEffect, useEffectEvent, useRef } from 'react'
import { placeholderStyle, Spinner } from '../../components'
import { cx } from '../../lib/cx'
import type { Media, Story } from '../../lib/types'
import { useImage } from '../../lib/useImage'
import { StoryOverlayText } from './StoryOverlayText'

/** A picture much wider than 9:16 is shown whole over a blurred copy instead of being cropped. */
export function isWide(media: Pick<Media, 'width' | 'height'>): boolean {
  return Boolean(media.width && media.height && media.width / media.height > 0.75)
}

interface StoryMediaProps {
  story: Story
  paused: boolean
  /** The picture is on screen (or failed and the placeholder is): the timer may start. */
  onReady: () => void
  /** Video stories last as long as the video. */
  onVideoDuration: (ms: number) => void
}

/** The story's picture or video filling the card, with its text on top. */
export function StoryMedia({ story, paused, onReady, onVideoDuration }: StoryMediaProps) {
  const alt = story.overlay?.text ? `Story by ${story.author.username}: ${story.overlay.text}` : `Story by ${story.author.username}`
  return (
    <div className="absolute inset-0">
      {story.media.type === 'video' ? (
        <StoryVideo media={story.media} paused={paused} onReady={onReady} onDuration={onVideoDuration} />
      ) : (
        <StoryPicture src={story.media.url} wide={isWide(story.media)} alt={alt} onReady={onReady} />
      )}
      <StoryOverlayText overlay={story.overlay} />
    </div>
  )
}

/** A story picture. Pictures still being drawn show a soft placeholder, so the story still plays. */
export function StoryPicture({ src, wide, alt, onReady }: { src: string; wide: boolean; alt: string; onReady?: () => void }) {
  const image = useImage(src)
  const reportReady = useEffectEvent(() => onReady?.())

  useEffect(() => {
    if (image.status !== 'loading') reportReady()
  }, [image.status])

  return (
    <div className="absolute inset-0">
      {image.status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center text-white/70">
          <Spinner size={28} />
        </div>
      )}
      {image.status === 'error' && <div aria-hidden className="absolute inset-0" style={placeholderStyle(src)} />}
      {image.url && wide && (
        <img src={image.url} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl" />
      )}
      {image.url && (
        <img
          src={image.url}
          alt={alt}
          draggable={false}
          onLoad={image.onLoad}
          onError={image.onError}
          className={cx('absolute inset-0 size-full', wide ? 'object-contain' : 'object-cover')}
        />
      )}
    </div>
  )
}

function StoryVideo({ media, paused, onReady, onDuration }: { media: Media; paused: boolean; onReady: () => void; onDuration: (ms: number) => void }) {
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const element = video.current
    if (!element) return
    if (paused) element.pause()
    else element.play().catch(() => {})
  }, [paused])

  return (
    <video
      ref={video}
      src={media.url}
      poster={media.poster ?? undefined}
      muted
      playsInline
      className="absolute inset-0 size-full object-cover"
      onLoadedMetadata={(event) => {
        const seconds = event.currentTarget.duration
        if (Number.isFinite(seconds) && seconds > 0) onDuration(Math.min(60, seconds) * 1000)
      }}
      onCanPlay={onReady}
      onError={onReady}
    />
  )
}
