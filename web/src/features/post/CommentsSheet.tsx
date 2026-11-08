import { Sheet } from '../../components'
import type { Post } from '../../lib/types'
import { CommentComposer, EmojiQuickBar } from './CommentComposer'
import { CommentThread } from './CommentThread'
import { useCommentDraft } from './useCommentDraft'

interface CommentsSheetProps {
  post: Post
  open: boolean
  onClose: () => void
  /** Width of the desktop dialog (see Sheet); reels use a wider one. */
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Comments as a bottom sheet on phones (a dialog on desktop): the thread scrolls, the emoji bar and
 * comment box stay at the bottom. Used by feed cards on phones and by reels.
 */
export function CommentsSheet({ post, open, onClose, size }: CommentsSheetProps) {
  const draft = useCommentDraft()
  return (
    <Sheet open={open} onClose={onClose} title="Comments" size={size}>
      <div className="flex h-[72dvh] flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
          <CommentThread post={post} draft={draft} />
        </div>
        <div className="shrink-0 border-t border-line">
          <EmojiQuickBar onPick={draft.addEmoji} />
          <CommentComposer post={post} draft={draft} />
        </div>
      </div>
    </Sheet>
  )
}
