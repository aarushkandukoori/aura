import type { PointerEventHandler } from 'react'
import { cx } from '../../lib/cx'
import type { StoryOverlay } from '../../lib/types'

export interface DragHandlers {
  onPointerDown: PointerEventHandler<HTMLElement>
  onPointerMove: PointerEventHandler<HTMLElement>
  onPointerUp: PointerEventHandler<HTMLElement>
  onPointerCancel: PointerEventHandler<HTMLElement>
}

/**
 * The text drawn on a story, at its saved height (overlay.y, 0 = top, 1 = bottom), in its color,
 * optionally on a pill. The size follows the card width (cqw), so it matches between composer and viewer.
 * The composer passes `drag` to make it draggable.
 */
export function StoryOverlayText({ overlay, drag }: { overlay: StoryOverlay | null; drag?: DragHandlers }) {
  if (!overlay?.text) return null
  return (
    <div
      className={cx('absolute inset-x-0 flex justify-center px-[6%]', !drag && 'pointer-events-none')}
      style={{ top: `${(overlay.y ?? 0.5) * 100}%`, transform: 'translateY(-50%)' }}
    >
      <span
        {...drag}
        className={cx(
          'max-w-full whitespace-pre-wrap break-words rounded-[0.35em] px-[0.45em] py-[0.15em] text-center font-semibold leading-tight',
          drag && 'cursor-grab touch-none select-none active:cursor-grabbing',
        )}
        style={{
          color: overlay.color ?? '#ffffff',
          backgroundColor: overlay.background ?? 'transparent',
          fontSize: 'clamp(16px, 6.2cqw, 32px)',
          // Without a pill, a soft shadow keeps light text readable on bright photos.
          textShadow: overlay.background ? 'none' : '0 1px 10px rgb(0 0 0 / 0.45)',
        }}
      >
        {overlay.text}
      </span>
    </div>
  )
}
