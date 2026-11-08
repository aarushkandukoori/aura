/**
 * Loading state for a remote picture that might not exist yet.
 *
 * The library pictures (/content/images/...) are still being drawn in the background, so a missing
 * one is tried again a few times (after 15 s, 45 s and 2 min). When it finally exists it fades in
 * without a reload. Uploaded pictures are not retried.
 */
import { useEffect, useState } from 'react'

const RETRY_DELAYS = [15_000, 45_000, 120_000]

export type ImageStatus = 'loading' | 'loaded' | 'error'

export function useImage(src: string | null | undefined) {
  const [currentSrc, setCurrentSrc] = useState(src)
  const [status, setStatus] = useState<ImageStatus>(src ? 'loading' : 'error')
  const [attempt, setAttempt] = useState(0)

  // A new src starts over (React's "adjust state when a prop changes" pattern).
  if (currentSrc !== src) {
    setCurrentSrc(src)
    setStatus(src ? 'loading' : 'error')
    setAttempt(0)
  }

  const retryable = Boolean(src?.startsWith('/content/'))
  useEffect(() => {
    if (status !== 'error' || !retryable || attempt >= RETRY_DELAYS.length) return
    const timer = window.setTimeout(() => {
      setAttempt((n) => n + 1)
      setStatus('loading')
    }, RETRY_DELAYS[attempt])
    return () => window.clearTimeout(timer)
  }, [status, retryable, attempt])

  // A query string makes the browser ask the server again instead of reusing the failed answer.
  const url = src && attempt > 0 ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src

  return {
    /** What to put in <img src>, or null when there is nothing to load. */
    url: status === 'error' ? null : url ?? null,
    status,
    onLoad: () => setStatus('loaded'),
    onError: () => setStatus('error'),
  }
}
