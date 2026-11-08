import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { useCloseOverlay } from '../../app/navigation'
import { Spinner } from '../../components'
import { api } from '../../lib/api'
import { useStore } from '../../lib/store'
import type { Story, StoryTray } from '../../lib/types'
import type { StoryNavState } from './navigation'
import { StoryMessage } from './StoryStage'
import { StoryViewer } from './StoryViewer'

/**
 * /stories/:username - one person's stories, full screen over the page you were on.
 * Opened from the stories tray it carries the tray order (see navigation.ts) and moves on to the
 * next person when these finish; opened from anywhere else it closes at the end.
 */
export function StoryViewerPage() {
  const { username = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const close = useCloseOverlay('/')
  const state = location.state as StoryNavState | null
  const tray = useStoryTray(username)

  const queue = state?.queue ?? []
  const position = queue.indexOf(username)
  const nextUser = position >= 0 ? queue[position + 1] : undefined
  const prevUser = position > 0 ? queue[position - 1] : undefined

  // Replace (not push) so Back / close returns straight to the page under the viewer.
  function openTray(target: string, startAtEnd: boolean) {
    const nextState: StoryNavState = { ...state, startAtEnd }
    navigate(`/stories/${target}`, { replace: true, state: nextState })
  }

  // Someone in the tray order whose stories expired meanwhile: skip straight to the next person.
  const skipTo = tray === null ? nextUser : undefined
  useEffect(() => {
    if (skipTo) navigate(`/stories/${skipTo}`, { replace: true, state: { ...state, startAtEnd: false } })
  }, [skipTo, navigate, state])

  if (tray === undefined || skipTo) {
    return (
      <StoryMessage onClose={close}>
        <Spinner size={28} className="text-white/70" />
      </StoryMessage>
    )
  }
  if (tray === null || tray.stories.length === 0) {
    return (
      <StoryMessage onClose={close}>
        <p className="text-lg font-semibold">This story is no longer available</p>
        <button type="button" onClick={close} className="h-10 rounded-full bg-white px-5 text-sm font-semibold text-black">
          Close
        </button>
      </StoryMessage>
    )
  }
  return (
    <StoryViewer
      key={username}
      stories={tray.stories}
      startIndex={state?.startAtEnd ? tray.stories.length - 1 : firstUnseen(tray.stories)}
      markSeen
      onClose={close}
      onNextTray={nextUser ? () => openTray(nextUser, false) : undefined}
      onPrevTray={prevUser ? () => openTray(prevUser, true) : undefined}
    />
  )
}

/** Start where you left off: the first story you haven't seen, or the first one if you've seen them all. */
function firstUnseen(stories: Story[]): number {
  const index = stories.findIndex((story) => !story.seen)
  return index === -1 ? 0 : index
}

/**
 * The person's current stories: from the home tray when it has them (that copy stays live),
 * otherwise fetched. undefined while loading, null when they have none up.
 */
function useStoryTray(username: string): StoryTray | null | undefined {
  const fromTray = useStore((s) => s.trays.find((tray) => tray.author.username === username))
  const [fetched, setFetched] = useState<{ username: string; tray: StoryTray | null } | null>(null)
  const needsFetch = !fromTray

  useEffect(() => {
    if (!needsFetch) return
    let cancelled = false
    api.userStories(username)
      .then((tray) => {
        if (!cancelled) setFetched({ username, tray })
      })
      .catch(() => {
        if (!cancelled) setFetched({ username, tray: null })
      })
    return () => {
      cancelled = true
    }
  }, [username, needsFetch])

  if (fromTray) return fromTray
  return fetched?.username === username ? fetched.tray : undefined
}
