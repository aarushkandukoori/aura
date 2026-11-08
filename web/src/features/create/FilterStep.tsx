/**
 * Filter step: pick a filter for each photo (Original, Glow, Dusk, Mono, Film, Vivid, Fade, Cool, Warm).
 */
import { CroppedImage, fitInSquare } from './CroppedImage'
import { FilterSwatch, Thumbnails } from './EditorControls'
import { FILTERS, type FilterName } from './filters'
import type { EditableImage } from './model'

interface FilterStepProps {
  images: EditableImage[]
  active: number
  onSelect: (index: number) => void
  ratio: number
  onFilter: (id: string, filter: FilterName) => void
  /** Desktop: the media square's CSS size. Phones: undefined (full width). */
  side?: string
}

export function FilterStep({ images, active, onSelect, ratio, onFilter, side }: FilterStepProps) {
  const image = images[active]
  const swatch = (filter: FilterName) => (
    <FilterSwatch image={image} filter={filter} selected={image.filter === filter} onSelect={() => onFilter(image.id, filter)} />
  )

  if (!side) {
    return (
      <div className="flex flex-col">
        <CroppedImage image={image} ratio={ratio} className="w-full" />
        {/* Each swatch sits in a fixed-width cell so the row scrolls sideways. */}
        <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 py-4">
          {FILTERS.map((filter) => (
            <div key={filter.name} className="w-[76px] shrink-0">
              {swatch(filter.name)}
            </div>
          ))}
        </div>
        {images.length > 1 && <Thumbnails images={images} active={active} onSelect={onSelect} />}
      </div>
    )
  }

  return (
    <div className="flex">
      <div className="relative flex items-center justify-center overflow-hidden bg-surface" style={{ width: side, height: side }}>
        <CroppedImage image={image} ratio={ratio} style={fitInSquare(ratio)} />
        {images.length > 1 && (
          <div className="absolute inset-x-3 bottom-3 flex justify-center">
            <Thumbnails dark images={images} active={active} onSelect={onSelect} />
          </div>
        )}
      </div>
      <div className="flex w-[340px] flex-col border-l border-line" style={{ height: side }}>
        <h3 className="border-b border-line px-4 py-3 text-sm font-semibold">Filters</h3>
        <div className="grid min-h-0 flex-1 grid-cols-3 content-start gap-x-3 gap-y-4 overflow-y-auto p-4">
          {FILTERS.map((filter) => (
            <div key={filter.name}>{swatch(filter.name)}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
