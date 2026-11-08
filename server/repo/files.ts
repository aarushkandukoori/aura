/**
 * Where media URLs live on disk: "/content/..." is the generated library (content/), and
 * "/media/uploads/..." is what the user uploaded (<dataDir>/uploads/). Used to check that an
 * upload exists before a post points at it, and by the simulation to read photos for the AI.
 */
import path from 'node:path'
import { config, uploadsDir } from '../config.ts'

const ROOTS: [prefix: string, folder: string][] = [
  ['/content/', config.contentDir],
  ['/media/uploads/', uploadsDir],
]

/** The file behind a media URL, or null for anything else (and for "../" tricks). */
export function mediaFilePath(url: string): string | null {
  for (const [prefix, folder] of ROOTS) {
    if (!url.startsWith(prefix)) continue
    let relative: string
    try {
      relative = decodeURIComponent(url.slice(prefix.length).split('?')[0])
    } catch {
      return null
    }
    const file = path.resolve(folder, relative)
    return file.startsWith(folder + path.sep) ? file : null
  }
  return null
}
