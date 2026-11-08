import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Wordmark } from '../../components'

/**
 * The 9:16 card a story is shown (and made) in: the whole screen on phones, a centered card on
 * desktop. `@container` lets the story text size itself to the card (cqw units) so it looks the
 * same in the composer and in the viewer. `overflow-clip` (not hidden) so the card can never be
 * scrolled: focusing a text box would otherwise shift the whole story sideways, because the blurred
 * backdrop of a wide photo is scaled a little past the card's edges.
 */
export const STORY_CARD = 'relative h-dvh w-full overflow-clip bg-black @container md:aspect-[9/16] md:h-[min(92dvh,860px)] md:w-auto md:rounded-xl'

interface StoryStageProps {
  onClose: () => void
  children: ReactNode
  /** How far the card is being dragged down (px): the backdrop fades as you pull. */
  pull?: number
}

/** The dark full-screen backdrop behind stories, with the wordmark and a close button on desktop. */
export function StoryStage({ onClose, children, pull = 0 }: StoryStageProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center gap-5 text-white"
      style={{ backgroundColor: `rgb(18 18 20 / ${Math.max(0.35, 1 - pull / 500)})` }}
    >
      <span className="absolute left-6 top-5 hidden md:block">
        <Wordmark className="text-[30px]" />
      </span>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 hidden size-11 place-items-center rounded-full transition hover:opacity-70 md:grid"
      >
        <X size={30} strokeWidth={1.75} />
      </button>
      {children}
    </div>
  )
}

/** The card with a short message, for "loading" and "no longer available". */
export function StoryMessage({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <StoryStage onClose={onClose}>
      <div className={STORY_CARD}>
        <div className="flex size-full flex-col items-center justify-center gap-4 px-8 text-center">{children}</div>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-2 top-[max(env(safe-area-inset-top),8px)] grid size-11 place-items-center md:hidden">
          <X size={26} />
        </button>
      </div>
    </StoryStage>
  )
}
