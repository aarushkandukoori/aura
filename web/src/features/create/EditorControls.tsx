/**
 * Small controls shared by the crop and filter steps: the photo strip, crop shape buttons,
 * the zoom slider and filter swatches.
 */
import { Plus, X, ZoomIn, ZoomOut } from 'lucide-react'
import { cx } from '../../lib/cx'
import { getFilter, type FilterName } from './filters'
import { ASPECT_OPTIONS, MAX_IMAGES, MAX_ZOOM, type AspectChoice, type EditableImage } from './model'

/** `dark` = drawn over the photo (desktop editor), otherwise on the page (phones). */
const PANEL = (dark: boolean) => (dark ? 'bg-black/60 text-white backdrop-blur-md' : 'bg-surface-2 text-fg')

interface ThumbnailsProps {
  images: EditableImage[]
  active: number
  onSelect: (index: number) => void
  onRemove?: (index: number) => void
  onAdd?: () => void
  dark?: boolean
}

/** The strip of picked photos: pick which one to edit, remove one, or add more. */
export function Thumbnails({ images, active, onSelect, onRemove, onAdd, dark = false }: ThumbnailsProps) {
  return (
    <div className={cx('no-scrollbar flex max-w-full gap-2 overflow-x-auto rounded-xl p-2', dark && PANEL(true))}>
      {images.map((image, index) => (
        <div key={image.id} className="relative shrink-0 p-1">
          <button
            type="button"
            aria-label={`Edit photo ${index + 1}`}
            aria-pressed={index === active}
            onClick={() => onSelect(index)}
            className={cx(
              'block size-14 overflow-hidden rounded-lg transition',
              index === active ? 'ring-2 ring-accent' : 'opacity-70 hover:opacity-100',
            )}
          >
            <img
              src={image.url}
              alt=""
              draggable={false}
              className="size-full object-cover"
              style={{ filter: getFilter(image.filter).css === 'none' ? undefined : getFilter(image.filter).css }}
            />
          </button>
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove photo ${index + 1}`}
              onClick={() => onRemove(index)}
              className="absolute right-0 top-0 grid size-5 place-items-center rounded-full bg-black/75 text-white ring-1 ring-white/40 hover:bg-black"
            >
              <X size={12} strokeWidth={3} />
            </button>
          )}
        </div>
      ))}
      {onAdd && images.length < MAX_IMAGES && (
        <div className="shrink-0 p-1">
          <button
            type="button"
            aria-label="Add photos"
            onClick={onAdd}
            className={cx(
              'grid size-14 place-items-center rounded-lg border-2 border-dashed transition hover:opacity-80',
              dark ? 'border-white/50 text-white' : 'border-line-strong text-muted',
            )}
          >
            <Plus size={22} />
          </button>
        </div>
      )}
    </div>
  )
}

export function AspectButtons({ value, onChange, dark = false }: { value: AspectChoice; onChange: (value: AspectChoice) => void; dark?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Crop shape" className={cx('flex rounded-full p-1', PANEL(dark))}>
      {ASPECT_OPTIONS.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              'h-8 rounded-full px-3 text-[13px] font-semibold transition',
              selected ? (dark ? 'bg-white text-black' : 'bg-elevated shadow-[0_1px_3px_rgb(0_0_0/0.12)]') : 'opacity-75 hover:opacity-100',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function ZoomSlider({ value, onChange, dark = false }: { value: number; onChange: (zoom: number) => void; dark?: boolean }) {
  return (
    <label className={cx('flex h-10 items-center gap-2 rounded-full px-3', PANEL(dark))}>
      <ZoomOut size={16} aria-hidden />
      <input
        type="range"
        aria-label="Zoom"
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-20 sm:w-28"
        style={{ accentColor: 'var(--accent)' }}
      />
      <ZoomIn size={16} aria-hidden />
    </label>
  )
}

/** A filter choice: the photo with that filter, and its name. */
export function FilterSwatch({ image, filter, selected, onSelect }: { image: EditableImage; filter: FilterName; selected: boolean; onSelect: () => void }) {
  const look = getFilter(filter)
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} className="group flex w-full flex-col items-center gap-1.5">
      <span
        className={cx(
          'relative isolate block aspect-square w-full overflow-hidden rounded-lg transition',
          selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : 'group-hover:opacity-85',
        )}
      >
        <img src={image.url} alt="" draggable={false} className="absolute inset-0 size-full object-cover" style={{ filter: look.css === 'none' ? undefined : look.css }} />
        {look.tint && (
          <span className="absolute inset-0" style={{ background: look.tint.color, mixBlendMode: look.tint.blend, opacity: look.tint.opacity }} />
        )}
      </span>
      <span className={cx('text-xs', selected ? 'font-semibold text-fg' : 'text-muted')}>{filter}</span>
    </button>
  )
}
