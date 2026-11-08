/**
 * A second face for merged notifications ("maya and 2,312 others liked your post"), so the row
 * can show two stacked avatars. Likes use someone else from that post's likes list; follows use
 * another of my followers. Each list is fetched once and remembered for the rest of the visit.
 */
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useStore } from '../../lib/store'
import type { Account, Notification } from '../../lib/types'

const lists = new Map<string, Promise<Account[]>>()

/** Fetch a list once; later calls share the same answer (an error just means no second face). */
function remembered(key: string, load: () => Promise<Account[]>): Promise<Account[]> {
  let list = lists.get(key)
  if (!list) {
    list = load().catch(() => [])
    lists.set(key, list)
  }
  return list
}

/** A small stable number from an id, so each follow notification picks its own face. */
function hash(text: string): number {
  let value = 0
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0
  return value
}

export function useSecondFace(notification: Notification): Account | null {
  const myUsername = useStore((s) => s.me?.username ?? '')
  const [face, setFace] = useState<Account | null>(null)
  const { id, kind, postId, actor, others } = notification
  const wanted = others > 0 && actor !== null && ((kind === 'like' && postId !== null) || kind === 'follow')
  const actorId = actor?.id

  useEffect(() => {
    if (!wanted) return
    let cancelled = false
    const candidates =
      kind === 'like' && postId
        ? remembered(`likes:${postId}`, () => api.postLikes(postId).then((result) => result.accounts))
        : remembered('followers', () => api.followers(myUsername).then((result) => result.accounts))

    candidates.then((accounts) => {
      if (cancelled) return
      // Real faces only: someone other than the actor (and me), with a profile picture.
      const pool = accounts.filter((account) => account.id !== actorId && account.kind !== 'me' && account.avatar)
      if (pool.length === 0) return
      if (kind === 'like') {
        setFace(pool[0]) // the best-known other liker
        return
      }
      // Follows: new followers are mostly the crowd, not old friends; each notification picks its own.
      const crowd = pool.filter((account) => account.kind === 'crowd')
      const choices = crowd.length > 0 ? crowd : pool
      setFace(choices[hash(id) % choices.length])
    })
    return () => {
      cancelled = true
    }
  }, [wanted, kind, postId, actorId, id, myUsername])

  return wanted ? face : null
}
