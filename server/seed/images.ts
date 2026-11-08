/**
 * How many content images exist on disk compared with how many the content files list.
 * The image generator runs in the background for a while, so /api/health reports its progress.
 * Checking ~700 files is cheap but not free, so the answer is cached for 30 seconds.
 */
import fs from 'node:fs'
import { mediaFilePath } from '../repo/files.ts'
import { loadContent } from './content.ts'

const CACHE_MS = 30_000
let cached: { ready: number; total: number; at: number } | null = null

/** Every image URL the content files mention: avatars, posts, stories, reel frames, crowd, presets. */
function listedImages(): Set<string> {
  const { cast, crowd } = loadContent()
  const urls = new Set<string>()
  for (const persona of cast) {
    if (persona.avatar?.file) urls.add(persona.avatar.file)
    for (const post of persona.posts ?? []) for (const image of post.images) urls.add(image.file)
    for (const story of persona.stories ?? []) urls.add(story.image.file)
    for (const reel of persona.reels ?? []) for (const frame of reel.frames) urls.add(frame.file)
  }
  for (const image of [...crowd.avatars, ...crowd.presets]) urls.add(image.file)
  return urls
}

export function imagesStatus(): { ready: number; total: number } {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    const urls = [...listedImages()]
    const ready = urls.filter((url) => {
      const file = mediaFilePath(url)
      return file !== null && fs.existsSync(file)
    }).length
    cached = { ready, total: urls.length, at: Date.now() }
  }
  return { ready: cached.ready, total: cached.total }
}
