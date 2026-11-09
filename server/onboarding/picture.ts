/**
 * The Google account's own photo as a profile picture. The apps show it during sign-up as the
 * default; when onboarding gets that exact URL back, the server downloads a bigger copy into this
 * world's uploads (posts and avatars only ever point at our own files). Only the signed-in
 * account's stored picture on Google's image host is ever fetched, nothing else.
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getUser } from '../db/accounts.ts'
import { currentWorldId } from '../db/index.ts'
import { imageExtension } from '../images/horde.ts'
import { currentUploads } from '../repo/files.ts'
import { authEnabled } from '../config.ts'

const MAX_BYTES = 5_000_000

/** Is this the signed-in Google account's picture? (Never true in local mode, where nobody signs in.) */
export function isAccountPicture(url: unknown): url is string {
  if (!authEnabled || typeof url !== 'string') return false
  const picture = getUser(currentWorldId())?.picture
  return Boolean(picture) && url === picture && isGoogleImage(url)
}

function isGoogleImage(url: string): boolean {
  const parsed = URL.parse(url)
  return parsed?.protocol === 'https:' && parsed.hostname.endsWith('.googleusercontent.com')
}

/**
 * Download the account picture into this world's uploads and return its URL, or null if that
 * fails (then the user simply starts without a photo and can add one later).
 */
export async function importAccountPicture(url: string): Promise<string | null> {
  try {
    // Google serves the size asked for in the URL ("=s96-c" is 96 px): ask for 512 px.
    const response = await fetch(url.replace(/=s\d+(-c)?$/, '=s512-c'), { signal: AbortSignal.timeout(10_000) })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !type.startsWith('image/')) throw new Error(`HTTP ${response.status} ${type}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length < 100 || bytes.length > MAX_BYTES) throw new Error(`${bytes.length} bytes`)
    const { folder, prefix } = currentUploads()
    const file = `${crypto.randomBytes(12).toString('base64url')}.${imageExtension(bytes)}`
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(path.join(folder, file), bytes)
    return `${prefix}${file}`
  } catch (error) {
    console.warn(`[onboarding] couldn't copy the Google profile picture: ${(error as Error).message}`)
    return null
  }
}
