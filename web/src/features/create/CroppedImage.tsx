/**
 * One photo inside its post frame: cropped, zoomed and filtered exactly like the exported picture.
 * Give it onPan (and onZoom) to make it draggable for the crop step.
 */
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { cx } from '../../lib/cx'
import { getFilter, type FilterName } from './filters'
import { clamp, MAX_ZOOM, placement, type EditableImage } from './model'

interface CroppedImageProps {
  image: EditableImage
  /** Width / height of the frame. */
  ratio: number
  /** Show this filter instead of the photo's own (filter previews). */
  filter?: FilterName
  /** Makes the photo draggable: called with the new pan while dragging. */
  onPan?: (panX: number, panY: number) => void
  /** Mouse wheel / trackpad zoom while editing. */
  onZoom?: (zoom: number) => void
  /** Rule-of-thirds lines (always shown while dragging). */
  showGrid?: boolean
  className?: string
  style?: CSSProperties
}

export function CroppedImage({ image, ratio, filter, onPan, onZoom, showGrid = false, className, style }: CroppedImageProps) {
  const place = placement(image, ratio)
  const look = getFilter(filter ?? image.filter)
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number; frameWidth: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!onPan) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = { x: event.clientX, y: event.clientY, panX: image.panX, panY: image.panY, frameWidth: event.currentTarget.clientWidth }
    setDragging(true)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current
    if (!start || !onPan) return
    // Distance dragged, in frame widths (the unit placement() uses).
    const dx = (event.clientX - start.x) / start.frameWidth
    const dy = (event.clientY - start.y) / start.frameWidth
    // Moving the photo by half its overflow takes the pan from 0 to 1.
    onPan(
      place.overflowX > 0 ? clamp(start.panX + (2 * dx) / place.overflowX, -1, 1) : 0,
      place.overflowY > 0 ? clamp(start.panY + (2 * dy) / place.overflowY, -1, 1) : 0,
    )
  }

  function endDrag() {
    dragStart.current = null
    setDragging(false)
  }

  return (
    <div
      className={cx('relative isolate shrink-0 overflow-hidden bg-surface', onPan && 'cursor-grab touch-none active:cursor-grabbing', className)}
      style={{ aspectRatio: String(ratio), ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onZoom ? (event) => onZoom(clamp(image.zoom - event.deltaY * 0.002, 1, MAX_ZOOM)) : undefined}
    >
      <img
        src={image.url}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none"
        style={{
          // The frame is 1 wide and 1/ratio tall, so heights and tops are scaled by the ratio.
          width: `${place.width * 100}%`,
          height: `${place.height * ratio * 100}%`,
          left: `${place.left * 100}%`,
          top: `${place.top * ratio * 100}%`,
          filter: look.css === 'none' ? undefined : look.css,
        }}
      />
      {look.tint && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: look.tint.color, mixBlendMode: look.tint.blend, opacity: look.tint.opacity }}
        />
      )}
      {(showGrid || dragging) && <ThirdsGrid />}
    </div>
  )
}

/** Size a frame to fit inside a square box: wide frames fill its width, tall ones its height. */
export function fitInSquare(ratio: number): CSSProperties {
  return ratio >= 1 ? { width: '100%' } : { height: '100%' }
}

function ThirdsGrid() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-y-0 left-1/3 w-px bg-white/60" />
      <div className="absolute inset-y-0 left-2/3 w-px bg-white/60" />
      <div className="absolute inset-x-0 top-1/3 h-px bg-white/60" />
      <div className="absolute inset-x-0 top-2/3 h-px bg-white/60" />
    </div>
  )
}
