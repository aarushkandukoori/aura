/**
 * Last step of a new post: caption, location and tagged people, next to a preview of the post.
 */
import { ChevronLeft, ChevronRight, Clapperboard, Copy } from 'lucide-react'
import { Avatar } from '../../components'
import { cx } from '../../lib/cx'
import { formatNumber } from '../../lib/format'
import { useMe } from '../../lib/store'
import type { Account } from '../../lib/types'
import { CroppedImage, fitInSquare } from './CroppedImage'
import type { EditableImage, PickedVideo } from './model'
import { LocationField, TagPeople } from './TagPeople'

const CAPTION_MAX = 2200

interface DetailsStepProps {
  images: EditableImage[]
  video: PickedVideo | null
  active: number
  onSelect: (index: number) => void
  ratio: number
  caption: string
  onCaption: (caption: string) => void
  location: string
  onLocation: (location: string) => void
  tagged: Account[]
  onTagged: (accounts: Account[]) => void
  /** Desktop: the media square's CSS size. Phones: undefined. */
  side?: string
}

export function DetailsStep(props: DetailsStepProps) {
  const { images, video, active, ratio, caption, onCaption, location, onLocation, tagged, onTagged, side } = props
  const me = useMe()
  const captionBox = (
    <textarea
      value={caption}
      onChange={(event) => onCaption(event.target.value.slice(0, CAPTION_MAX))}
      placeholder={video ? 'Write a caption for your reel...' : 'Write a caption...'}
      aria-label="Caption"
      rows={4}
      autoFocus={Boolean(side)} // desktop only: on phones it would pop the keyboard over the form
      className="size-full resize-none bg-transparent text-[15px] leading-snug outline-none placeholder:text-muted"
    />
  )
  const counter = (
    <span className="text-xs tabular-nums text-muted">
      {formatNumber(caption.length)}/{formatNumber(CAPTION_MAX)}
    </span>
  )

  if (!side) {
    return (
      <div className="flex flex-col">
        <div className="flex gap-3 p-4">
          <div className="relative w-[72px] shrink-0 self-start overflow-hidden rounded-md">
            {video ? (
              <video src={video.url} muted autoPlay loop playsInline className="aspect-[4/5] w-full bg-black object-cover" />
            ) : (
              <CroppedImage image={images[0]} ratio={ratio} className="w-full" />
            )}
            {images.length > 1 && (
              <span className="absolute right-1 top-1 text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)]">
                <Copy size={14} strokeWidth={2.25} className="-scale-x-100" />
              </span>
            )}
          </div>
          <div className="flex min-h-[110px] flex-1 flex-col">
            <div className="flex-1">{captionBox}</div>
            <div className="text-right">{counter}</div>
          </div>
        </div>
        <LocationField value={location} onChange={onLocation} />
        <TagPeople tagged={tagged} onChange={onTagged} />
        <div className="border-t border-line" />
      </div>
    )
  }

  return (
    <div className="flex">
      <div className="relative flex items-center justify-center overflow-hidden bg-surface" style={{ width: side, height: side }}>
        {video ? <VideoPreview video={video} /> : <ImagePreview {...props} />}
      </div>
      <div className="flex w-[340px] flex-col overflow-y-auto border-l border-line" style={{ height: side }}>
        <div className="flex items-center gap-3 px-4 pt-4">
          <Avatar account={me} size={28} />
          <span className="truncate text-sm font-semibold">{me.username}</span>
        </div>
        <div className="h-44 shrink-0 px-4 py-3">{captionBox}</div>
        <div className="flex justify-end px-4 pb-2">{counter}</div>
        <LocationField value={location} onChange={onLocation} />
        <TagPeople tagged={tagged} onChange={onTagged} />
      </div>
    </div>
  )
}

/** The cropped, filtered photos with arrows and dots to look through a carousel. */
function ImagePreview({ images, active, onSelect, ratio }: DetailsStepProps) {
  return (
    <>
      <CroppedImage image={images[active]} ratio={ratio} style={fitInSquare(ratio)} />
      {images.length > 1 && (
        <>
          {active > 0 && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => onSelect(active - 1)}
              className="absolute left-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black shadow-pop hover:bg-white"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {active < images.length - 1 && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => onSelect(active + 1)}
              className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black shadow-pop hover:bg-white"
            >
              <ChevronRight size={18} />
            </button>
          )}
          <div className="absolute bottom-4 flex gap-1">
            {images.map((image, index) => (
              <span key={image.id} className={cx('size-1.5 rounded-full', index === active ? 'bg-accent' : 'bg-white/70')} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function VideoPreview({ video }: { video: PickedVideo }) {
  return (
    <div className="relative size-full bg-black">
      <video src={video.url} muted autoPlay loop playsInline className="size-full object-contain" />
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
        <Clapperboard size={14} />
        Reel
      </span>
    </div>
  )
}
