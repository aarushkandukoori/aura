/**
 * Loads the generated content files: content/cast.json (the characters with their posts, stories
 * and reels) and content/crowd.json (background followers, avatar pool, preset avatars).
 * Either file may be missing or half-written while content is still being generated: then the
 * world is just smaller, never broken.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { CastFile, CastPersona, CrowdFile } from '../../shared/cast.ts'
import { config } from '../config.ts'

export interface Content {
  cast: CastPersona[]
  crowd: CrowdFile
}

const CACHE_MS = 30_000
let cached: { content: Content; at: number } | null = null

function readJson<T>(file: string): Partial<T> | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(config.contentDir, file), 'utf8')) as Partial<T>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`[seed] could not read content/${file}: ${(error as Error).message}`)
    return null
  }
}

/** The content files, re-read at most every 30 s (or right away with fresh: true). */
export function loadContent(options: { fresh?: boolean } = {}): Content {
  if (cached && !options.fresh && Date.now() - cached.at < CACHE_MS) return cached.content
  const castFile = readJson<CastFile>('cast.json')
  const crowdFile = readJson<CrowdFile>('crowd.json')
  const content: Content = {
    cast: Array.isArray(castFile?.personas) ? castFile.personas : [],
    crowd: {
      version: 1,
      accounts: crowdFile?.accounts ?? [],
      avatars: crowdFile?.avatars ?? [],
      presets: crowdFile?.presets ?? [],
    },
  }
  cached = { content, at: Date.now() }
  return content
}

/** Is this username already used by one of the characters? (The world is real: no duplicates.) */
export function usernameTakenByCharacters(username: string): boolean {
  const { cast, crowd } = loadContent()
  const wanted = username.toLowerCase()
  return cast.some((persona) => persona.username.toLowerCase() === wanted)
    || crowd.accounts.some((account) => account.username.toLowerCase() === wanted)
}
