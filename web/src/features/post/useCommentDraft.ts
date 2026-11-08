import { useRef, useState } from 'react'
import type { Comment, ID } from '../../lib/types'

/**
 * The state of one comments panel, shared by the comment list and the comment box under it:
 * the text being typed, which comment "Reply" was tapped on, and which reply threads are open.
 *
 *   const draft = useCommentDraft()
 *   <CommentThread post={post} draft={draft} />
 *   <CommentComposer post={post} draft={draft} />
 */
export function useCommentDraft() {
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [openThreads, setOpenThreads] = useState<ReadonlySet<ID>>(() => new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  /** "Reply" on a comment: show "Replying to @x", start the text with @x and focus the box. */
  function startReply(comment: Comment) {
    setReplyTo(comment)
    setText(`@${comment.author.username} `)
    inputRef.current?.focus()
  }

  function cancelReply() {
    if (replyTo && text.trim() === `@${replyTo.author.username}`) setText('')
    setReplyTo(null)
  }

  /** After a comment is posted. */
  function reset() {
    setText('')
    setReplyTo(null)
  }

  function addEmoji(emoji: string) {
    setText((current) => current + emoji)
    inputRef.current?.focus()
  }

  function openThread(commentId: ID) {
    setOpenThreads((current) => new Set(current).add(commentId))
  }

  function toggleThread(commentId: ID) {
    setOpenThreads((current) => {
      const next = new Set(current)
      if (next.has(commentId)) next.delete(commentId)
      else next.add(commentId)
      return next
    })
  }

  return { text, setText, replyTo, startReply, cancelReply, reset, addEmoji, openThreads, openThread, toggleThread, inputRef }
}

export type CommentDraft = ReturnType<typeof useCommentDraft>
