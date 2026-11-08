/**
 * Uploading photos and videos.
 *
 * Photos are shrunk in the browser to at most 1440 px on the long side and saved as JPEG
 * (quality 0.86) before upload, so a 12 MB phone photo becomes a few hundred KB.
 * Videos go up as they are, plus a poster frame (a still image) captured from the video, which the
 * grid uses as a thumbnail and the AI uses to "see" the video.
 */
import { api } from './api'
import type { Media, UploadResponse } from './types'

const MAX_SIDE = 1440
const JPEG_QUALITY = 0.86

export interface ImageBlob {
  blob: Blob
  width: number
  height: number
}

/** Upload any picked file: images are resized first, videos get a poster. Returns ready-to-post Media. */
export async function uploadMedia(file: File): Promise<Media> {
  if (file.type.startsWith('video/')) return uploadVideo(file)
  const uploaded = await uploadImage(file)
  return { url: uploaded.url, type: 'image', width: uploaded.width, height: uploaded.height }
}

/** Resize an image file and upload it. */
export async function uploadImage(file: Blob): Promise<UploadResponse> {
  const image = await resizeImage(file)
  return api.upload(image.blob, { width: image.width, height: image.height })
}

/** Upload something already drawn on a canvas (the crop/filter editor, the story composer). */
export async function uploadCanvas(canvas: HTMLCanvasElement): Promise<UploadResponse> {
  const blob = await canvasToJpeg(canvas)
  return api.upload(blob, { width: canvas.width, height: canvas.height })
}

/** Upload a video file as it is, plus a poster frame. */
export async function uploadVideo(file: File): Promise<Media> {
  const poster = await captureVideoPoster(file)
  const posterUpload = await api.upload(poster.blob, { width: poster.width, height: poster.height })
  const video = await api.upload(file, { width: poster.width, height: poster.height })
  return { url: video.url, type: 'video', width: poster.width, height: poster.height, poster: posterUpload.url }
}

/** Shrink an image so its long side is at most `maxSide` px, as a JPEG. */
export async function resizeImage(file: Blob, maxSide = MAX_SIDE): Promise<ImageBlob> {
  const bitmap = await createImageBitmap(file) // applies the photo's EXIF rotation
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available')
    ctx.fillStyle = '#ffffff' // transparent PNGs would otherwise turn black as JPEG
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    return { blob: await canvasToJpeg(canvas), width, height }
  } finally {
    bitmap.close()
  }
}

/** Grab one frame from early in a video as a JPEG (also gives the video's size). */
export function captureVideoPoster(file: Blob): Promise<ImageBlob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url

    const fail = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Couldn't read that video"))
    }
    video.onerror = fail
    video.onloadedmetadata = () => {
      // A frame slightly into the clip avoids a black first frame.
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2)
    }
    video.onseeked = async () => {
      try {
        const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
        const blob = await canvasToJpeg(canvas)
        URL.revokeObjectURL(url)
        resolve({ blob, width: video.videoWidth, height: video.videoHeight })
      } catch {
        fail()
      }
    }
  })
}

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))), 'image/jpeg', JPEG_QUALITY)
  })
}
