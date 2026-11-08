/**
 * The first step of a new post: drop photos/videos (desktop) or pick them, or switch to a story.
 */
import { Clapperboard, ImagePlus } from 'lucide-react'
import { Button } from '../../components'
import { cx } from '../../lib/cx'

interface SelectStepProps {
  onPick: () => void
  onStory: () => void
  /** A file is being dragged over the editor. */
  dragging: boolean
  phone: boolean
}

export function SelectStep({ onPick, onStory, dragging, phone }: SelectStepProps) {
  return (
    <div
      className={cx(
        'flex flex-col items-center justify-center gap-4 px-8 text-center transition-colors',
        phone ? 'flex-1 pb-24 pt-10' : 'size-full',
        dragging && 'bg-accent-soft',
      )}
    >
      <div className="relative mb-2 h-[88px] w-[104px]" aria-hidden>
        <span className="absolute left-0 top-3 grid size-[72px] -rotate-6 place-items-center rounded-2xl border-2 border-fg bg-bg">
          <ImagePlus size={34} strokeWidth={1.5} />
        </span>
        <span className="absolute right-0 top-0 grid size-[64px] rotate-6 place-items-center rounded-2xl border-2 border-fg bg-bg">
          <Clapperboard size={28} strokeWidth={1.5} />
        </span>
      </div>
      <h2 className="text-xl font-semibold">{phone ? 'Share a moment' : 'Drop photos or a video here'}</h2>
      <p className="-mt-2 max-w-[280px] text-sm text-muted">Up to 10 photos, or one video for a reel.</p>
      <Button size={phone ? 'lg' : 'md'} onClick={onPick}>
        {phone ? 'Choose from your library' : 'Choose files'}
      </Button>
      <PostOrStory onStory={onStory} />
    </div>
  )
}

/** "Post | Story": the story side opens the story composer instead. */
function PostOrStory({ onStory }: { onStory: () => void }) {
  return (
    <div role="radiogroup" aria-label="What to share" className="mt-6 flex rounded-full bg-surface-2 p-1 text-[13px] font-semibold">
      <button type="button" role="radio" aria-checked className="h-8 rounded-full bg-elevated px-5 shadow-[0_1px_3px_rgb(0_0_0/0.12)]">
        Post
      </button>
      <button type="button" role="radio" aria-checked={false} onClick={onStory} className="h-8 rounded-full px-5 text-muted transition hover:text-fg">
        Story
      </button>
    </div>
  )
}
