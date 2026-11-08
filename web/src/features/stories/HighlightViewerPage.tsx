import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useCloseOverlay } from '../../app/navigation'
import { Spinner } from '../../components'
import { api } from '../../lib/api'
import type { Story } from '../../lib/types'
import type { HighlightInfo } from './StoryHeader'
import { StoryMessage } from './StoryStage'
import { StoryViewer } from './StoryViewer'

/** /highlights/:id - a saved highlight from a profile, played in the story viewer (with its title and cover). */
export function HighlightViewerPage() {
  const { id = '' } = useParams()
  const close = useCloseOverlay('/')
  const [stories, setStories] = useState<Story[] | null | undefined>(undefined)
  const [info, setInfo] = useState<HighlightInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const list = await api.highlight(id)
        if (cancelled) return
        setStories(list)
        // The highlight's title and cover live on its owner's profile.
        const owner = list[0]?.author
        if (!owner) return
        const profile = await api.profile(owner.username)
        const highlight = profile.highlights.find((h) => h.id === id)
        if (!cancelled && highlight) setInfo({ title: highlight.title, cover: highlight.cover })
      } catch {
        // A missing title is fine; a missing highlight shows the message below.
        if (!cancelled) setStories((current) => current ?? null)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (stories === undefined) {
    return (
      <StoryMessage onClose={close}>
        <Spinner size={28} className="text-white/70" />
      </StoryMessage>
    )
  }
  if (stories === null || stories.length === 0) {
    return (
      <StoryMessage onClose={close}>
        <p className="text-lg font-semibold">This highlight isn't available</p>
        <button type="button" onClick={close} className="h-10 rounded-full bg-white px-5 text-sm font-semibold text-black">
          Close
        </button>
      </StoryMessage>
    )
  }
  return <StoryViewer key={id} stories={stories} startIndex={0} highlight={info} onClose={close} />
}
