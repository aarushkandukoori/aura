/**
 * The new-post editor's data: the picked photos (each with its own crop and filter) or one video,
 * the crop shape, and the math that places a photo inside its frame.
 */
import type { FilterName } from './filters'

export type AspectChoice = 'original' | 'square' | 'portrait'

export const ASPECT_OPTIONS: { value: AspectChoice; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'square', label: '1:1' },
  { value: 'portrait', label: '4:5' },
]

export interface EditableImage {
  id: string
  file: File
  /** Object URL of the picked file, for previews. */
  url: string
  /** The photo's own size in pixels. */
  width: number
  height: number
  /** 1 = the photo just covers the frame; up to MAX_ZOOM. */
  zoom: number
  /** -1..1: how far the photo is moved inside the frame (0 = centered, 1 = pushed fully right/down). */
  panX: number
  panY: number
  filter: FilterName
}

export interface PickedVideo {
  file: File
  url: string
}

export const MAX_IMAGES = 10
export const MAX_ZOOM = 3
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024 // the server's upload limit

// The tallest and widest shapes a post can have (like other photo apps).
const TALLEST = 4 / 5
const WIDEST = 1.91

/** Width / height of the post. "Original" follows the first photo, kept between 4:5 and 1.91:1. */
export function aspectRatio(choice: AspectChoice, first: { width: number; height: number } | undefined): number {
  if (choice === 'square') return 1
  if (choice === 'portrait') return 4 / 5
  if (!first) return 1
  return Math.min(WIDEST, Math.max(TALLEST, first.width / first.height))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Where the photo sits inside a frame of the given ratio, measured in frame widths (the frame is
 * 1 wide and 1/ratio tall). The CSS preview and the canvas export both use this, so what you see
 * is exactly what gets posted.
 */
export function placement(image: EditableImage, ratio: number) {
  const frameHeight = 1 / ratio
  // The smallest scale at which the photo still covers the whole frame.
  const cover = Math.max(1 / image.width, frameHeight / image.height)
  const width = image.width * cover * image.zoom
  const height = image.height * cover * image.zoom
  // How much of the photo hangs outside the frame; panning moves it within that range.
  const overflowX = width - 1
  const overflowY = height - frameHeight
  return {
    width,
    height,
    left: (-overflowX / 2) * (1 - image.panX),
    top: (-overflowY / 2) * (1 - image.panY),
    overflowX,
    overflowY,
  }
}
