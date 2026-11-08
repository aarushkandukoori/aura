import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { LoadingBlock } from '../../components'
import { api } from '../../lib/api'
import { useStore } from '../../lib/store'
import type { Comment, Post } from '../../lib/types'
import { CommentRow } from './CommentRow'
import type { CommentDraft } from './useCommentDraft'

/**
 * New comments slide in and glow for a moment (accent color at low strength, fine in both themes).
 * AnimatePresence initial={false} skips this for the comments that are there when the list opens.
 */
const enter = {
  initial: { opacity: 0, y: 8, backgroundColor: 'rgba(110, 86, 248, 0.14)' },
  animate: { opacity: 1, y: 0, backgroundColor: 'rgba(110, 86, 248, 0)' },
  exit: { opacity: 0 },
  transition: { duration: 0.25, backgroundColor: { duration: 1.8 } },
}

/**
 * Every comment on a post, threaded: pinned first, replies folded under "View replies (N)".
 * Loads them into the store, which live comment.new / comment.stats events then keep up to date.
 */
export function CommentThread({ post, draft, className }: { post: Post; draft: CommentDraft; className?: string }) {
  const comments = useStore((s) => s.comments[post.id])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.comments(post.id)
      .then((list) => {
        if (!cancelled) useStore.getState().setComments(post.id, list)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [post.id])

  if (!comments) {
    return failed ? <p className="px-4 py-10 text-center text-sm text-muted">Couldn't load comments.</p> : <LoadingBlock />
  }
  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <p className="text-xl font-bold">No comments yet</p>
        <p className="mt-1 text-sm text-muted">Start the conversation.</p>
      </div>
    )
  }

  const ordered = [...comments.filter((c) => c.pinned), ...comments.filter((c) => !c.pinned)]
  return (
    <ul className={className}>
      <AnimatePresence initial={false}>
        {ordered.map((comment) => (
          <motion.li key={comment.id} className="px-4" {...enter}>
            <CommentRow comment={comment} post={post} onReply={() => draft.startReply(comment)} />
            <Replies comment={comment} post={post} draft={draft} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}

/** "—— View replies (3)" under a comment; the replies themselves once it is opened. */
function Replies({ comment, post, draft }: { comment: Comment; post: Post; draft: CommentDraft }) {
  const count = comment.replies.length
  if (count === 0) return null
  const open = draft.openThreads.has(comment.id)
  return (
    <div className="pl-11">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => draft.toggleThread(comment.id)}
        className="flex items-center gap-3 py-1 text-xs font-semibold text-muted hover:text-fg"
      >
        <span aria-hidden className="h-px w-6 bg-muted/60" />
        {open ? 'Hide replies' : `View replies (${count})`}
      </button>
      {open && (
        <ul>
          <AnimatePresence initial={false}>
            {comment.replies.map((reply) => (
              <motion.li key={reply.id} {...enter}>
                <CommentRow comment={reply} post={post} small onReply={() => draft.startReply(reply)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
