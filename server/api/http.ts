/**
 * Helpers shared by the route files: HTTP errors, reading and checking request input, and calling
 * simulation hooks safely.
 *
 * Routes throw HttpError for anything the client did wrong; the error handler in server/app.ts
 * turns every error into { error: "message" } with the right status code.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { NextFunction, Request, Response } from 'express'
import type { Media } from '../../shared/types.ts'
import { isOnboarded, mediaFilePath } from '../repo/index.ts'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const badRequest = (message: string) => new HttpError(400, message)
export const forbidden = (message: string) => new HttpError(403, message)
export const notFound = (what: string) => new HttpError(404, `${what} not found`)

/** Most routes need a world to exist: until onboarding is done they answer 409. */
export function requireOnboarded(_req: Request, _res: Response, next: NextFunction): void {
  if (!isOnboarded()) throw new HttpError(409, 'Finish onboarding first')
  next()
}

/**
 * Run a simulation hook after the user's action is saved. Hooks only schedule work, but a bug in
 * one must never turn a successful like or post into an error for the user.
 */
export function notifySim(hook: () => void): void {
  try {
    hook()
  } catch (error) {
    console.error('[sim] hook failed:', error)
  }
}

// ----- reading input --------------------------------------------------------------------------

/** The JSON body as an object ({} when there was no body). */
export function body(req: Request): Record<string, unknown> {
  const value: unknown = req.body
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** A query-string value as a single string, or null when missing or empty. */
export function queryText(req: Request, name: string): string | null {
  const value = req.query[name]
  return typeof value === 'string' && value !== '' ? value : null
}

/** Required text, trimmed, with a length limit. */
export function text(value: unknown, field: string, limits: { min?: number; max: number }): string {
  if (typeof value !== 'string') throw badRequest(`${field} must be text`)
  const trimmed = value.trim()
  if (trimmed.length < (limits.min ?? 0)) throw badRequest(`${field} can't be empty`)
  if (trimmed.length > limits.max) throw badRequest(`${field} is too long (max ${limits.max} characters)`)
  return trimmed
}

/** Text for PATCH bodies: undefined (not sent) stays undefined. */
export function optionalText(value: unknown, field: string, limits: { min?: number; max: number }): string | undefined {
  return value === undefined ? undefined : text(value, field, limits)
}

/** Optional text where missing, null and "" all mean null. */
export function nullableText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null
  return text(value, field, { max }) || null
}

export function oneOf<T extends string>(value: unknown, options: readonly T[], field: string): T {
  if (typeof value === 'string' && (options as readonly string[]).includes(value)) return value as T
  throw badRequest(`${field} must be one of: ${options.join(', ')}`)
}

export function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw badRequest(`${field} must be true or false`)
  return value
}

/** A list of ids without duplicates. */
export function idList(value: unknown, field: string, limits: { min: number; max: number }): string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) throw badRequest(`${field} must be a list of ids`)
  const ids = [...new Set(value as string[])]
  if (ids.length < limits.min) throw badRequest(`${field} needs at least ${limits.min}`)
  if (ids.length > limits.max) throw badRequest(`${field} can have at most ${limits.max}`)
  return ids
}

/** A list of short words, like interests: trimmed, no empties, no duplicates. */
export function wordList(value: unknown, field: string, limits: { min: number; max: number; length: number }): string[] {
  if (!Array.isArray(value)) throw badRequest(`${field} must be a list`)
  const words = [...new Set(value.map((word) => text(word, field, { max: limits.length })).filter(Boolean))]
  if (words.length < limits.min) throw badRequest(`Pick at least ${limits.min} ${field.toLowerCase()}`)
  if (words.length > limits.max) throw badRequest(`Pick at most ${limits.max} ${field.toLowerCase()}`)
  return words
}

/**
 * Words that are app pages. Profiles live at /<username>, after these routes, so a profile called
 * "explore" could never be opened. The web app's onboarding blocks the same list.
 */
const RESERVED_USERNAMES = new Set([
  'explore', 'reels', 'search', 'create', 'stories', 'highlights', 'messages', 'activity', 'settings', 'saved',
  'onboarding', 'api', 'media', 'content', 'assets',
])

/** Usernames: 3-24 lowercase letters, numbers, dots and underscores, and not an app page. */
export function username(value: unknown): string {
  const name = text(value, 'Username', { min: 1, max: 30 }).toLowerCase().replace(/^@/, '')
  if (!/^[a-z0-9._]{3,24}$/.test(name)) throw badRequest('Usernames are 3-24 characters: letters, numbers, dots and underscores')
  if (RESERVED_USERNAMES.has(name)) throw badRequest("That username isn't available")
  return name
}

/** The file types the server accepts, and the extension each is saved with (see POST /upload in media.ts). */
export const FILE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

/** Does this file name end like a photo (or a video)? "/content/x/p1.webp" is an image. */
function hasExtensionOf(file: string, type: 'image' | 'video'): boolean {
  const extension = path.extname(file).slice(1).toLowerCase()
  return Object.entries(FILE_TYPES).some(([mime, saved]) => mime.startsWith(`${type}/`) && saved === extension)
}

/**
 * A media URL we serve ourselves: a library image, or an upload that really exists. Its file
 * must be the right kind: a post can't show content/cast.json, and a .webp can't play as a video.
 */
export function mediaUrl(value: unknown, field: string, type: 'image' | 'video' = 'image'): string {
  const url = text(value, field, { min: 1, max: 500 })
  const file = mediaFilePath(url)
  if (!file) throw badRequest(`${field} must be an uploaded file or a library image`)
  if (!hasExtensionOf(file, type)) throw badRequest(`${field} must be ${type === 'image' ? 'a photo' : 'a video'}`)
  // Library images may still be generating, so only uploads must already exist.
  if (url.startsWith('/media/uploads/') && !fs.existsSync(file)) throw badRequest(`${field} was never uploaded`)
  return url
}

/** A width or height header/field: a positive whole number, otherwise null. */
export function dimension(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 && number <= 20_000 ? number : null
}

/** One Media item: url + type, optional size, and a poster frame (an image) for videos. */
export function media(value: unknown, field = 'media'): Media {
  if (!value || typeof value !== 'object') throw badRequest(`${field} is missing`)
  const item = value as Record<string, unknown>
  const type = oneOf(item.type, ['image', 'video'] as const, `${field}.type`)
  return {
    url: mediaUrl(item.url, `${field}.url`, type),
    type,
    width: dimension(item.width),
    height: dimension(item.height),
    poster: item.poster === undefined || item.poster === null ? null : mediaUrl(item.poster, `${field}.poster`, 'image'),
  }
}
