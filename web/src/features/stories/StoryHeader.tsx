import { Pause, Play, X } from 'lucide-react'
import { Avatar, Img, UsernameLink } from '../../components'
import { timeAgo } from '../../lib/format'
import type { Story } from '../../lib/types'

export interface HighlightInfo {
  title: string
  cover: string
}

interface StoryHeaderProps {
  story: Story
  /** Highlights show their cover and title instead of the person. */
  highlight: HighlightInfo | null
  paused: boolean
  onTogglePause: () => void
  onClose: () => void
}

/** Who posted the story and when, a pause button (desktop) and a close button (phones). */
export function StoryHeader({ story, highlight, paused, onTogglePause, onClose }: StoryHeaderProps) {
  return (
    <div className="mt-2.5 flex items-center gap-2.5 pl-1">
      {highlight ? (
        <Img src={highlight.cover} alt="" className="size-8 shrink-0 rounded-full" />
      ) : (
        <Avatar account={story.author} size={32} link />
      )}
      <div className="flex min-w-0 items-center gap-2 text-sm drop-shadow-[0_1px_2px_rgb(0_0_0/0.4)]">
        {highlight ? <span className="truncate font-semibold">{highlight.title}</span> : <UsernameLink account={story.author} />}
        <span className="shrink-0 text-white/75">{timeAgo(story.createdAt)}</span>
      </div>
      <div className="ml-auto flex items-center">
        <button
          type="button"
          aria-label={paused ? 'Play' : 'Pause'}
          onClick={onTogglePause}
          className="hidden size-10 place-items-center rounded-full transition hover:opacity-70 md:grid"
        >
          {paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
        </button>
        <button type="button" aria-label="Close" onClick={onClose} className="grid size-11 place-items-center md:hidden">
          <X size={26} />
        </button>
      </div>
    </div>
  )
}
