import { useState } from 'react'
import { Avatar, LinkifiedText, UsernameLink } from '../../components'
import { timeAgo } from '../../lib/format'
import type { Comment, Post } from '../../lib/types'

/** Captions longer than this (or than two lines) start folded with a "more" button. */
const PREVIEW_CHARACTERS = 110

/** The start of a long caption (two lines, ~110 characters, cut at a word), or null when it fits whole. */
function captionPreview(caption: string): string | null {
  let text = caption.split('\n').slice(0, 2).join('\n')
  const characters = Array.from(text) // counts emoji as one character, so we never cut one in half
  if (characters.length > PREVIEW_CHARACTERS) {
    text = characters.slice(0, PREVIEW_CHARACTERS).join('').replace(/\s+\S*$/, '')
  }
  text = text.trimEnd()
  return text.length < caption.trimEnd().length ? text : null
}

/** "username caption…" under a post in the feed, with links and a "more" button for long ones. */
export function Caption({ post }: { post: Post }) {
  const [expanded, setExpanded] = useState(false)
  if (!post.caption) return null
  const preview = expanded ? null : captionPreview(post.caption)
  return (
    <p className="whitespace-pre-line break-words text-sm">
      <UsernameLink account={post.author} /> <LinkifiedText text={preview ?? post.caption} />
      {preview !== null && (
        <>
          …{' '}
          <button type="button" onClick={() => setExpanded(true)} className="text-muted hover:text-fg">
            more
          </button>
        </>
      )}
    </p>
  )
}

/** The two comments shown under a post in the feed (no replies), one line each. Tapping opens the comments. */
export function PreviewComments({ comments, onOpen }: { comments: Comment[]; onOpen: () => void }) {
  if (comments.length === 0) return null
  return (
    <div className="space-y-0.5">
      {comments.map((comment) => (
        <p key={comment.id} onClick={onOpen} className="line-clamp-2 cursor-pointer break-words text-sm">
          <UsernameLink account={comment.author} /> <LinkifiedText text={comment.text} />
        </p>
      ))}
    </div>
  )
}

/** The caption written like the first comment, at the top of the comments in the post detail view. */
export function CaptionRow({ post }: { post: Post }) {
  if (!post.caption) return null
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <Avatar account={post.author} size={32} story link />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="whitespace-pre-line break-words text-sm leading-snug">
          <UsernameLink account={post.author} /> <LinkifiedText text={post.caption} />
        </p>
        <time dateTime={new Date(post.createdAt).toISOString()} className="mt-1 block text-xs text-muted">
          {timeAgo(post.createdAt)}
        </time>
      </div>
    </div>
  )
}
