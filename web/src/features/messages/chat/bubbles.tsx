/**
 * The text parts of a message: the bubble itself, links inside it, and the quote above a reply.
 */
import { Reply } from 'lucide-react'
import { Fragment } from 'react'
import { Link } from 'react-router'
import { cx } from '../../../lib/cx'
import { linkify } from '../../../lib/format'
import { useDoubleTap } from '../../../lib/hooks'
import type { Message } from '../../../lib/types'
import { isEmojiOnly } from '../emoji'
import { replyLabel } from '../preview'

/** Round everywhere except where a bubble joins the one above / below from the same person. */
export function bubbleCorners(mine: boolean, first: boolean, last: boolean): string {
  return cx(
    'rounded-[20px]',
    !first && (mine ? 'rounded-tr-[6px]' : 'rounded-tl-[6px]'),
    !last && (mine ? 'rounded-br-[6px]' : 'rounded-bl-[6px]'),
  )
}

interface TextBubbleProps {
  text: string
  mine: boolean
  first: boolean
  last: boolean
  /** Double tap / double click: react with a heart. */
  onDoubleTap: () => void
}

/** A text message: accent bubble on the right for mine, neutral on the left for theirs. Emoji-only texts show big. */
export function TextBubble({ text, mine, first, last, onDoubleTap }: TextBubbleProps) {
  const onTap = useDoubleTap(onDoubleTap)
  if (isEmojiOnly(text)) {
    return (
      <div onClick={onTap} className="px-0.5 text-[40px] leading-[1.15]">
        {text}
      </div>
    )
  }
  return (
    <div
      onClick={onTap}
      // A double click would also select a word; keep the selection for deliberate drags.
      onMouseDown={(event) => {
        if (event.detail > 1) event.preventDefault()
      }}
      className={cx(
        'max-w-full whitespace-pre-wrap px-3.5 py-2 text-[15px] leading-[1.35] [overflow-wrap:anywhere]',
        mine ? 'bg-accent text-white' : 'bg-surface-2 text-fg',
        bubbleCorners(mine, first, last),
      )}
    >
      <ChatText text={text} mine={mine} />
    </div>
  )
}

/** Message text with @mentions and #tags linked (styled to stay readable on my accent bubble). */
function ChatText({ text, mine }: { text: string; mine: boolean }) {
  return (
    <>
      {linkify(text).map((part, index) => {
        if (part.kind === 'text') return <Fragment key={index}>{part.text}</Fragment>
        const to = part.kind === 'mention' ? `/${part.username}` : `/explore/tags/${encodeURIComponent(part.tag)}`
        return (
          <Link
            key={index}
            to={to}
            onClick={(event) => event.stopPropagation()}
            className={cx('font-semibold hover:underline', mine ? 'underline decoration-white/50 underline-offset-2' : 'text-link')}
          >
            {part.text}
          </Link>
        )
      })}
    </>
  )
}

/** "You replied to Maya" plus a faded copy of the quoted message; clicking it jumps to the original. */
export function ReplyQuote({ message, mine, isGroup, onJump }: { message: Message; mine: boolean; isGroup: boolean; onJump: () => void }) {
  if (!message.replyTo) return null
  return (
    <div className={cx('flex max-w-full flex-col', mine ? 'items-end' : 'items-start')}>
      <span className="mb-1 flex items-center gap-1 px-1 text-xs text-muted">
        <Reply size={12} strokeWidth={2} aria-hidden />
        {replyLabel(message, isGroup)}
      </span>
      <button
        type="button"
        onClick={onJump}
        title="Go to the original message"
        className="-mb-2.5 max-w-full rounded-[18px] border border-line bg-bg px-3.5 pb-4 pt-2 text-left text-[13px] leading-snug text-muted transition hover:bg-surface"
      >
        <span className="line-clamp-2 [overflow-wrap:anywhere]">{message.replyTo.text}</span>
      </button>
    </div>
  )
}
