/**
 * Publishing: draw each photo with its crop and filter onto a canvas, upload it (or upload the
 * video with a poster frame), then create the post.
 */
import { api } from '../../lib/api'
import type { Account, CreatePostRequest, Media, Post } from '../../lib/types'
import { uploadCanvas, uploadVideo } from '../../lib/upload'
import { getFilter } from './filters'
import { placement, type EditableImage, type PickedVideo } from './model'

/** Exported photos are 1080 px wide (the height follows the crop shape). */
const OUTPUT_WIDTH = 1080

/** Draw one photo exactly as it looks in the editor (crop, zoom, filter). */
export async function renderImage(image: EditableImage, ratio: number): Promise<HTMLCanvasElement> {
  const width = OUTPUT_WIDTH
  const height = Math.round(OUTPUT_WIDTH / ratio)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')

  const bitmap = await createImageBitmap(image.file)
  const place = placement(image, ratio)
  const filter = getFilter(image.filter)
  ctx.fillStyle = '#ffffff' // transparent PNGs would turn black as JPEG
  ctx.fillRect(0, 0, width, height)
  ctx.filter = filter.css
  // placement() measures in frame widths, so multiplying by the canvas width gives pixels.
  ctx.drawImage(bitmap, place.left * width, place.top * width, place.width * width, place.height * width)
  ctx.filter = 'none'
  bitmap.close()

  if (filter.tint) {
    ctx.globalCompositeOperation = filter.tint.blend
    ctx.globalAlpha = filter.tint.opacity
    ctx.fillStyle = filter.tint.color
    ctx.fillRect(0, 0, width, height)
  }
  return canvas
}

export interface PostDraft {
  images: EditableImage[]
  video: PickedVideo | null
  ratio: number
  caption: string
  location: string
  tagged: Account[]
}

/** Upload everything and create the post. `onProgress` gets a short status line for the screen. */
export async function publishPost(draft: PostDraft, onProgress: (status: string) => void): Promise<Post> {
  const media: Media[] = []
  if (draft.video) {
    onProgress('Uploading your video...')
    media.push(await uploadVideo(draft.video.file))
  } else {
    for (const [index, image] of draft.images.entries()) {
      onProgress(draft.images.length > 1 ? `Uploading photo ${index + 1} of ${draft.images.length}...` : 'Uploading your photo...')
      const canvas = await renderImage(image, draft.ratio)
      const uploaded = await uploadCanvas(canvas)
      media.push({ url: uploaded.url, type: 'image', width: canvas.width, height: canvas.height })
    }
  }

  onProgress('Sharing...')
  const request: CreatePostRequest = {
    kind: draft.video ? 'reel' : media.length > 1 ? 'carousel' : 'photo',
    media,
    caption: draft.caption.trim(),
    location: draft.location.trim() || null,
    taggedIds: draft.tagged.map((account) => account.id),
  }
  return api.createPost(request)
}
