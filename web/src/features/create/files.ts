/**
 * Turning picked or dropped files into editor items: up to 10 photos, or one video (a reel).
 */
import { MAX_IMAGES, MAX_VIDEO_BYTES, type EditableImage, type PickedVideo } from './model'

export interface PickResult {
  images: EditableImage[]
  video: PickedVideo | null
  /** Something to tell the person (a file was skipped, too many photos...). */
  notice: string | null
}

let nextId = 1

const isVideo = (file: File) => file.type.startsWith('video/')
const isImage = (file: File) => file.type.startsWith('image/')

/** `photosAlready` = photos already in the editor (when adding more). */
export async function readFiles(files: File[], photosAlready: number): Promise<PickResult> {
  const usable = files.filter((file) => isImage(file) || isVideo(file))
  let notice = usable.length < files.length ? 'Only photos and videos can be posted.' : null

  const video = usable.find(isVideo)
  if (video && photosAlready === 0) {
    if (video.size > MAX_VIDEO_BYTES) return { images: [], video: null, notice: 'That video is too big. Pick one under 150 MB.' }
    if (usable.length > 1) notice = 'A reel is one video, so we used the first one.'
    return { images: [], video: { file: video, url: URL.createObjectURL(video) }, notice }
  }
  if (video) notice = 'Videos post on their own as reels, so we skipped it.'

  const photos = usable.filter(isImage)
  const room = MAX_IMAGES - photosAlready
  if (photos.length > room) notice = `A post can have up to ${MAX_IMAGES} photos.`

  const images: EditableImage[] = []
  for (const file of photos.slice(0, room)) {
    try {
      // Decoding once tells us the real size (with the photo's rotation applied).
      const bitmap = await createImageBitmap(file)
      images.push({
        id: String(nextId++),
        file,
        url: URL.createObjectURL(file),
        width: bitmap.width,
        height: bitmap.height,
        zoom: 1,
        panX: 0,
        panY: 0,
        filter: 'Original',
      })
      bitmap.close()
    } catch {
      notice = `Couldn't open ${file.name}. Try a JPEG or PNG.`
    }
  }
  return { images, video: null, notice }
}
