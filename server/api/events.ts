/**
 * The recommendation algorithm's routes (the algorithm itself is in server/recs):
 * - watchActions: every request is checked for strong signals: likes, saves, comments, shares,
 *   follows, opening a post's comments or a hashtag page, opening or writing in a chat, replying to
 *   a story, picking an Explore topic. The routes that do those things don't need to know.
 * - POST /events: the quiet signals only the apps can see (a TrackRequest): how long a post was on
 *   screen, reels watched to the end, stories watched or skipped, profiles opened, searches.
 * - GET /suggestions: accounts to follow, ranked by what the user likes (this replaces the plain
 *   list in accounts.ts: this router runs first).
 */
import express, { Router, type NextFunction, type Request, type Response } from 'express'
import type { TrackEventType } from '../../shared/types.ts'
import { currentWorldId, withWorld, worldState } from '../db/index.ts'
import { learnBatch, recommendAccounts, type Signal } from '../recs/index.ts'
import { badRequest, body, HttpError } from './http.ts'

export const recsRoutes = Router()

// ----- strong signals from the normal API ---------------------------------------------------------

type Action = { method: string; path: RegExp; signal: (id: string, req: Request) => Omit<Signal, 'at'> | null }

const firstPage = (req: Request) => req.query.cursor === undefined

/** API calls that say something about taste, and the signal each one is. `id` is the path's id. */
const ACTIONS: Action[] = [
  { method: 'POST', path: /^\/posts\/([\w-]+)\/like$/, signal: (id) => ({ type: 'like', postId: id }) },
  { method: 'DELETE', path: /^\/posts\/([\w-]+)\/like$/, signal: (id) => ({ type: 'unlike', postId: id }) },
  { method: 'POST', path: /^\/posts\/([\w-]+)\/save$/, signal: (id) => ({ type: 'save', postId: id }) },
  { method: 'DELETE', path: /^\/posts\/([\w-]+)\/save$/, signal: (id) => ({ type: 'unsave', postId: id }) },
  { method: 'POST', path: /^\/posts\/([\w-]+)\/comments$/, signal: (id) => ({ type: 'comment', postId: id }) },
  { method: 'POST', path: /^\/posts\/([\w-]+)\/share$/, signal: (id) => ({ type: 'share', postId: id }) },
  { method: 'GET', path: /^\/posts\/([\w-]+)\/comments$/, signal: (id) => ({ type: 'open', postId: id }) },
  { method: 'POST', path: /^\/accounts\/([\w-]+)\/follow$/, signal: (id) => ({ type: 'follow', accountId: id }) },
  { method: 'DELETE', path: /^\/accounts\/([\w-]+)\/follow$/, signal: (id) => ({ type: 'unfollow', accountId: id }) },
  { method: 'POST', path: /^\/stories\/([\w-]+)\/(?:reply|react)$/, signal: (id) => ({ type: 'story_reply', storyId: id }) },
  { method: 'POST', path: /^\/conversations\/([\w-]+)\/messages$/, signal: (id) => ({ type: 'message', conversationId: id }) },
  {
    method: 'GET', path: /^\/conversations\/([\w-]+)\/messages$/,
    signal: (id, req) => (firstPage(req) ? { type: 'dm_open', conversationId: id } : null), // older pages aren't a new visit
  },
  { method: 'GET', path: /^\/tags\/([^/]+)$/, signal: (tag, req) => (firstPage(req) ? { type: 'tag_open', tag: decoded(tag) } : null) },
  {
    method: 'GET', path: /^\/explore$/,
    signal: (_id, req) => (firstPage(req) && typeof req.query.topic === 'string' ? { type: 'topic_open', tag: req.query.topic } : null),
  },
]

function decoded(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** The signal a request would be, if it works. */
function signalFor(req: Request): Omit<Signal, 'at'> | null {
  for (const action of ACTIONS) {
    if (action.method !== req.method) continue
    const match = action.path.exec(req.path)
    if (match) return action.signal(match[1] ?? '', req)
  }
  return null
}

/**
 * Learn from the request once its response is sent, and only if it worked. The world id is
 * captured now because the 'finish' event fires outside the request's own context.
 */
function watchActions(req: Request, res: Response, next: NextFunction): void {
  const signal = signalFor(req)
  if (signal) {
    const worldId = currentWorldId()
    res.on('finish', () => {
      if (res.statusCode >= 300) return
      try {
        withWorld(worldId, () => learnBatch([{ ...signal, at: Date.now() }])) // a batch of one: it also trims the log
      } catch (error) {
        console.error('[recs] could not learn from a request:', error) // never worth crashing over
      }
    })
  }
  next()
}

recsRoutes.use(watchActions)

// ----- POST /events -------------------------------------------------------------------------------

const TRACK_TYPES: TrackEventType[] = ['impression', 'open', 'profile_view', 'reel_watch', 'story_view', 'story_skip', 'search', 'tag_open']
/** Apps send at most this many events per request (they batch every ~10 s). */
const MAX_EVENTS = 200
/** Nobody looks at one post for more than 10 minutes; longer times are a tab left open. */
const MAX_MS = 10 * 60 * 1000
/** A world takes at most this many events a minute, so a stuck or hostile client can't flood it. */
const EVENTS_PER_MINUTE = 1200

const idOrNull = (value: unknown) => (typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : null)
const textOrNull = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

/** One TrackEvent from the app as a Signal, or null when it isn't one we understand. */
function toSignal(value: unknown): Signal | null {
  if (!value || typeof value !== 'object') return null
  const event = value as Record<string, unknown>
  if (!TRACK_TYPES.includes(event.type as TrackEventType)) return null
  return {
    type: event.type as TrackEventType,
    postId: idOrNull(event.postId),
    accountId: idOrNull(event.accountId),
    storyId: idOrNull(event.storyId),
    ms: typeof event.ms === 'number' && Number.isFinite(event.ms) ? Math.min(MAX_MS, Math.max(0, event.ms)) : null,
    complete: event.complete === true,
    query: textOrNull(event.query, 100),
    tag: textOrNull(event.tag, 60),
    at: typeof event.at === 'number' ? event.at : Date.now(),
  }
}

const rate = worldState(() => ({ minute: 0, count: 0 }))

function checkRate(count: number): void {
  const state = rate()
  const minute = Math.floor(Date.now() / 60_000)
  if (state.minute !== minute) {
    state.minute = minute
    state.count = 0
  }
  state.count += count
  if (state.count > EVENTS_PER_MINUTE) throw new HttpError(429, 'Too many events. Try again in a minute.')
}

/** The body: JSON normally, or text/plain JSON from navigator.sendBeacon (sent when a page is closing). */
function trackBody(req: Request): Record<string, unknown> {
  if (typeof req.body !== 'string') return body(req)
  try {
    const parsed: unknown = JSON.parse(req.body)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    throw badRequest('The request body is not valid JSON')
  }
}

recsRoutes.post('/events', express.text({ type: 'text/plain', limit: '256kb' }), (req, res) => {
  const events = trackBody(req).events
  if (!Array.isArray(events)) throw badRequest('events must be a list')
  if (events.length > MAX_EVENTS) throw badRequest(`Send at most ${MAX_EVENTS} events at a time`)
  checkRate(events.length)
  const signals = events.flatMap((event) => toSignal(event) ?? [])
  const accepted = learnBatch(signals)
  res.json({ ok: true, accepted })
})

// ----- GET /suggestions ---------------------------------------------------------------------------

recsRoutes.get('/suggestions', (_req, res) => {
  res.json(recommendAccounts(8))
})
