/**
 * Tracking: tells the recommendation algorithm (server/recs) what the user looks at, so their feed,
 * Explore and Reels fill up with what they enjoy. Likes, comments, follows and shares are already
 * known from their own API calls; these are the quiet signals only the app can see:
 *
 *   useImpression(postId)        a post at least half on screen for 1 s or more, and for how long
 *   trackOpen(postId)            opened a post or its comments
 *   useReelWatch(...)            time spent on a reel, and whether it played to the end
 *   useStoryWatch(...)           a story watched (time on screen) or skipped (tapped past within 1.5 s)
 *   useProfileView(accountId)    opened someone's profile
 *   trackSearch(query)           searched for something
 *   useTagView(tag)              opened a hashtag page
 *
 * Events wait in a queue and go out together every 10 seconds, and right away when the app is
 * hidden or closed (with navigator.sendBeacon, which still works while a page is closing).
 */
import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { ID, TrackEvent } from './types'

const FLUSH_MS = 10_000
/** Events per request (the server takes up to 200). */
const BATCH = 100
/** A post must stay half on screen this long to count as seen. */
const MIN_IMPRESSION_MS = 1000
/** Leaving a story sooner than this is a skip. */
const STORY_SKIP_MS = 1500
/** Shorter than this isn't a real look: a quick re-render, or React mounting twice in development. */
const NOISE_MS = 100

// ----- the queue ------------------------------------------------------------------------------

const queue: TrackEvent[] = []
let timer: number | undefined

/** Queue one event; it goes out within 10 seconds. */
export function track(event: Omit<TrackEvent, 'at'>): void {
  queue.push({ ...event, at: Date.now() })
  if (queue.length >= BATCH) flush()
  else timer ??= window.setTimeout(() => flush(), FLUSH_MS)
}

/** Send everything waiting. `closing`: the page may be going away, so use sendBeacon. */
function flush(closing = false): void {
  window.clearTimeout(timer)
  timer = undefined
  while (queue.length > 0) {
    const events = queue.splice(0, BATCH)
    // sendBeacon posts the text as text/plain (the server reads that too). It returns false when
    // the browser won't take it; then a normal request is the best we can do.
    if (closing && navigator.sendBeacon?.('/api/events', JSON.stringify({ events }))) continue
    api.track({ events }).catch(() => {}) // a lost batch only makes the feed a little less personal
  }
}

// ----- timing things on screen ----------------------------------------------------------------

/** Something being timed right now (a post on screen, a reel playing). */
interface Watch {
  /** The app went to the background: stop the clock (and send what was seen). */
  pause: () => void
  /** The app is back. */
  resume: () => void
}

const watches = new Set<Watch>()

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    for (const watch of watches) watch.pause()
    flush(true)
  } else {
    for (const watch of watches) watch.resume()
  }
})
window.addEventListener('pagehide', () => flush(true))

const pageVisible = () => document.visibilityState !== 'hidden'

/** A clock that only runs while started and the page is visible. take() returns the time and resets it. */
function clock() {
  let total = 0
  let since: number | null = null
  const stop = () => {
    if (since !== null) total += performance.now() - since
    since = null
  }
  const start = () => {
    if (since === null && pageVisible()) since = performance.now()
  }
  const take = () => {
    stop()
    const ms = Math.round(total)
    total = 0
    return ms
  }
  return { start, stop, take }
}

// ----- the hooks and calls the screens use ----------------------------------------------------

/**
 * Put the returned ref on a post. Each stretch of time it spends at least half on screen (1 s or
 * more) becomes one impression with its duration.
 */
export function useImpression(postId: ID | null): (node: Element | null) => void {
  const [node, setNode] = useState<Element | null>(null)
  useEffect(() => {
    if (!node || !postId) return
    const time = clock()
    let inView = false
    const end = () => {
      const ms = time.take()
      if (ms >= MIN_IMPRESSION_MS) track({ type: 'impression', postId, ms })
    }
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && entry.intersectionRatio >= 0.5
      if (inView) time.start()
      else end()
    }, { threshold: 0.5 })
    observer.observe(node)
    const watch: Watch = {
      pause: end,
      resume: () => {
        if (inView) time.start()
      },
    }
    watches.add(watch)
    return () => {
      observer.disconnect()
      watches.delete(watch)
      end()
    }
  }, [node, postId])
  return setNode
}

/** The user opened a post or its comments. */
export function trackOpen(postId: ID): void {
  track({ type: 'open', postId })
}

/**
 * Time spent on a reel while it is the one on screen, sent when the user moves on (or leaves the
 * app). `lengthMs` is how long one play takes (null until a video knows); reaching it is "complete".
 */
export function useReelWatch(postId: ID, active: boolean, lengthMs: number | null): void {
  const length = useRef(lengthMs)
  useEffect(() => {
    length.current = lengthMs // read when the watch ends: a video learns its length after it starts
  }, [lengthMs])
  useEffect(() => {
    if (!active) return
    const time = clock()
    time.start()
    const send = () => {
      const ms = time.take()
      if (ms >= NOISE_MS * 3) track({ type: 'reel_watch', postId, ms, complete: length.current !== null && ms >= length.current })
    }
    const watch: Watch = { pause: send, resume: () => time.start() }
    watches.add(watch)
    return () => {
      watches.delete(watch)
      send()
    }
  }, [postId, active])
}

/** Time on one story of someone else's: a skip under 1.5 s, otherwise a view with its time. */
export function useStoryWatch(storyId: ID | null, accountId: ID | null): void {
  useEffect(() => {
    if (!storyId) return
    const time = clock()
    time.start()
    const watch: Watch = { pause: () => time.stop(), resume: () => time.start() }
    watches.add(watch)
    return () => {
      watches.delete(watch)
      const ms = time.take()
      if (ms < NOISE_MS) return
      if (ms < STORY_SKIP_MS) track({ type: 'story_skip', storyId, accountId })
      else track({ type: 'story_view', storyId, accountId, ms })
    }
  }, [storyId, accountId])
}

/** The user opened someone's profile (pass null for their own, or while it loads). */
export function useProfileView(accountId: ID | null): void {
  useEffect(() => {
    if (accountId) track({ type: 'profile_view', accountId })
  }, [accountId])
}

let lastSearch = ''

/** The user searched (call it when results for a settled query arrive). */
export function trackSearch(query: string): void {
  const clean = query.trim().toLowerCase()
  if (clean.length < 2 || clean === lastSearch) return
  lastSearch = clean
  track({ type: 'search', query: clean })
}

/** The user opened a hashtag page. */
export function useTagView(tag: string): void {
  useEffect(() => {
    if (tag) track({ type: 'tag_open', tag })
  }, [tag])
}
