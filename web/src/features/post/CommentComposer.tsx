import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Avatar, Spinner, toast } from '../../components'
import { api } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useMe, useStore } from '../../lib/store'
import type { Comment, Post } from '../../lib/types'
import type { CommentDraft } from './useCommentDraft'

interface CommentComposerProps {
  post: Post
  draft: CommentDraft
  /** The small box under a post in the feed: no avatar or reply chip, "Post" appears once you type. */
  compact?: boolean
  onPosted?: (comment: Comment) => void
  className?: string
}

/** "Add a comment…" with a Post button (Enter also posts). Shows "Replying to @x" while replying. */
export function CommentComposer({ post, draft, compact = false, onPosted, className }: CommentComposerProps) {
  const me = useMe()
  const [sending, setSending] = useState(false)
  const hasText = draft.text.trim().length > 0
  const placeholder = draft.replyTo ? `Reply to ${draft.replyTo.author.username}…` : 'Add a comment…'

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.text.trim()
    if (!text || sending) return
    // Replies always hang off the top-level comment, even when answering a reply.
    const parentId = draft.replyTo ? draft.replyTo.parentId ?? draft.replyTo.id : null
    setSending(true)
    try {
      const comment = await api.createComment(post.id, { text, parentId })
      useStore.getState().addComment(comment) // the live echo of it is ignored as a duplicate
      if (comment.parentId) draft.openThread(comment.parentId)
      draft.reset()
      onPosted?.(comment)
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't post your comment")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={className}>
      {!compact && draft.replyTo && (
        <div className="flex items-center justify-between bg-surface py-1 pl-4 pr-2 text-[13px] text-muted">
          <span className="truncate">
            Replying to <span className="font-semibold text-fg">@{draft.replyTo.author.username}</span>
          </span>
          <button type="button" aria-label="Cancel reply" onClick={draft.cancelReply} className="grid size-8 place-items-center rounded-full hover:bg-surface-2">
            <X size={15} />
          </button>
        </div>
      )}
      <form onSubmit={submit} className={cx('flex items-center gap-3', compact ? 'pt-1' : 'px-4 py-2')}>
        {!compact && <Avatar account={me} size={32} />}
        <input
          ref={draft.inputRef}
          value={draft.text}
          onChange={(event) => draft.setText(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={2200}
          autoComplete="off"
          enterKeyHint="send"
          readOnly={sending}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
        />
        {(!compact || hasText) && (
          <button
            type="submit"
            disabled={!hasText || sending}
            className="grid min-w-9 place-items-center text-sm font-semibold text-accent transition hover:text-accent-hover disabled:opacity-40"
          >
            {sending ? <Spinner size={16} /> : 'Post'}
          </button>
        )}
      </form>
    </div>
  )
}

const QUICK_EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂']

/** A row of emoji that drop into the comment box with one tap. */
export function EmojiQuickBar({ onPick, className }: { onPick: (emoji: string) => void; className?: string }) {
  return (
    <div className={cx('flex justify-between px-3 py-1.5', className)}>
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`Add ${emoji}`}
          onClick={() => onPick(emoji)}
          className="grid size-10 place-items-center rounded-full text-[22px] transition hover:scale-110 hover:bg-surface active:scale-95"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
