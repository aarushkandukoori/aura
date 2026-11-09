/**
 * Where media URLs live on disk:
 * - "/content/..." is the generated library (content/), the same for every world.
 * - Uploads belong to one world. Local mode keeps the original "/media/uploads/<file>" URLs
 *   (data/uploads); with sign-in each world serves its own at "/media/<world id>/<file>"
 *   (data/worlds/<world id>/uploads). server/app.ts serves both shapes.
 * Used to check that an upload exists before a post points at it, and by the simulation to read
 * photos for the AI.
 */
import path from 'node:path'
import { config } from '../config.ts'
import { currentWorldId, LOCAL_WORLD, worldUploadsDir } from '../db/index.ts'

/** The current world's uploads: the folder on disk, and the URL prefix they are served at. */
export function currentUploads(): { folder: string; prefix: string } {
  const worldId = currentWorldId()
  return {
    folder: worldUploadsDir(worldId),
    prefix: worldId === LOCAL_WORLD ? '/media/uploads/' : `/media/${worldId}/`,
  }
}

/** An uploaded file's URL (as opposed to a library image). */
export const isUploadUrl = (url: string): boolean => url.startsWith('/media/')

/**
 * The file behind a media URL: a library image, or one of the current world's uploads. Null for
 * anything else, including another world's uploads and "../" tricks.
 */
export function mediaFilePath(url: string): string | null {
  if (url.startsWith('/content/')) return fileInside(config.contentDir, url.slice('/content/'.length))
  if (!isUploadUrl(url)) return null
  const { folder, prefix } = currentUploads()
  return url.startsWith(prefix) ? fileInside(folder, url.slice(prefix.length)) : null
}

function fileInside(folder: string, relativeUrl: string): string | null {
  let relative: string
  try {
    relative = decodeURIComponent(relativeUrl.split('?')[0])
  } catch {
    return null
  }
  const file = path.resolve(folder, relative)
  return file.startsWith(folder + path.sep) ? file : null
}
