/**
 * Crop step: choose the post's shape (Original / 1:1 / 4:5), then drag and zoom each photo in its frame.
 */
import { Images } from 'lucide-react'
import { useState } from 'react'
import { cx } from '../../lib/cx'
import { CroppedImage, fitInSquare } from './CroppedImage'
import { AspectButtons, Thumbnails, ZoomSlider } from './EditorControls'
import type { AspectChoice, EditableImage } from './model'

interface CropStepProps {
  images: EditableImage[]
  active: number
  onSelect: (index: number) => void
  aspect: AspectChoice
  onAspect: (aspect: AspectChoice) => void
  ratio: number
  onChange: (id: string, changes: Partial<EditableImage>) => void
  onRemove: (index: number) => void
  onAdd: () => void
  /** Desktop: the media square's CSS size. Phones: undefined (full width). */
  side?: string
}

export function CropStep({ images, active, onSelect, aspect, onAspect, ratio, onChange, onRemove, onAdd, side }: CropStepProps) {
  const [showStrip, setShowStrip] = useState(images.length > 1)
  const image = images[active]
  const frame = (
    <CroppedImage
      key={image.id}
      image={image}
      ratio={ratio}
      onPan={(panX, panY) => onChange(image.id, { panX, panY })}
      onZoom={(zoom) => onChange(image.id, { zoom })}
      className={side ? undefined : 'w-full'}
      style={side ? fitInSquare(ratio) : undefined}
    />
  )
  const zoom = <ZoomSlider dark={Boolean(side)} value={image.zoom} onChange={(value) => onChange(image.id, { zoom: value })} />

  if (!side) {
    return (
      <div className="flex flex-col">
        {frame}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <AspectButtons value={aspect} onChange={onAspect} />
          {zoom}
        </div>
        <Thumbnails images={images} active={active} onSelect={onSelect} onRemove={onRemove} onAdd={onAdd} />
      </div>
    )
  }

  return (
    <div className="relative flex items-center justify-center overflow-hidden bg-surface" style={{ width: side, height: side }}>
      {frame}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-end gap-2">
        {showStrip && (
          <div className="pointer-events-auto max-w-full">
            <Thumbnails dark images={images} active={active} onSelect={onSelect} onRemove={onRemove} onAdd={onAdd} />
          </div>
        )}
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <AspectButtons dark value={aspect} onChange={onAspect} />
            {zoom}
          </div>
          <button
            type="button"
            aria-label={showStrip ? 'Hide photos' : 'Show photos'}
            aria-pressed={showStrip}
            onClick={() => setShowStrip((open) => !open)}
            className={cx(
              'pointer-events-auto relative grid size-10 place-items-center rounded-full backdrop-blur-md transition',
              showStrip ? 'bg-white text-black' : 'bg-black/60 text-white hover:bg-black/70',
            )}
          >
            <Images size={19} />
            {images.length > 1 && (
              <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">
                {images.length}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
