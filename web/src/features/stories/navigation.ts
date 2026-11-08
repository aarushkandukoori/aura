import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useBackgroundLocation, type NavState } from '../../app/navigation'

/**
 * What the story viewer keeps in its history entry: the page underneath (see app/navigation.ts),
 * plus the order of the stories tray, so it can move on to the next person when one finishes.
 */
export interface StoryNavState extends NavState {
  /** Usernames in tray order. Opened from anywhere else (a post avatar, a profile) there is no queue. */
  queue?: string[]
  /** Start at this person's last story (going back from the next person). */
  startAtEnd?: boolean
}

/** Returns openTray(username, queue): the full-screen viewer over the current page, then on through `queue`. */
export function useOpenStoryQueue(): (username: string, queue: string[]) => void {
  const navigate = useNavigate()
  const location = useLocation()
  const background = useBackgroundLocation()
  return useCallback(
    (username: string, queue: string[]) => {
      const state: StoryNavState = { background: background ?? location, queue }
      navigate(`/stories/${username}`, { state })
    },
    [navigate, location, background],
  )
}
