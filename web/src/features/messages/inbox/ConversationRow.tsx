import { BellOff } from 'lucide-react'
import { Link } from 'react-router'
import { cx } from '../../../lib/cx'
import { timeAgo } from '../../../lib/format'
import { useStore, useTyping } from '../../../lib/store'
import type { Conversation } from '../../../lib/types'
import { ConversationAvatar } from '../ConversationAvatar'
import { inboxPreview, typingLabel } from '../preview'

interface ConversationRowProps {
  conversation: Conversation
  /** The chat open next to the inbox (desktop). */
  active: boolean
  /** The current time, ticking in the inbox so "2m" stays true. */
  now: number
}

/** One chat in the inbox: picture, name, last message (or "typing..."), time, unread dot. */
export function ConversationRow({ conversation, active, now }: ConversationRowProps) {
  const typing = useTyping(conversation.id)
  const unread = conversation.unread > 0
  const isTyping = typing.length > 0
  const preview = isTyping ? typingLabel(conversation, typing) : inboxPreview(conversation)

  // A DM picture with a story ring opens the story, so it sits above the row's link.
  const member = conversation.members[0]
  const hasStory = useStore((s) => (member ? (s.accounts[member.id] ?? member).hasStory : false))
  const storyClickable = conversation.kind === 'dm' && hasStory

  return (
    <div className={cx('relative flex items-center gap-3 px-4 py-2 transition-colors md:px-6', active ? 'bg-surface-2' : 'hover:bg-surface')}>
      {/* The whole row is one link; the picture sits on top of it only when it opens a story. */}
      <Link
        to={`/messages/${conversation.id}`}
        aria-label={`Chat with ${conversation.title}${unread ? `, ${conversation.unread} unread` : ''}`}
        aria-current={active ? 'page' : undefined}
        className="absolute inset-0 outline-offset-[-2px]"
      />
      <span className={storyClickable ? 'relative z-10' : 'pointer-events-none'}>
        <ConversationAvatar conversation={conversation} size={56} story showActive />
      </span>

      <div className="pointer-events-none min-w-0 flex-1">
        <div className={cx('truncate text-sm', unread ? 'font-bold' : 'font-normal')}>{conversation.title}</div>
        <div className={cx('mt-0.5 flex min-w-0 text-[13px]', unread ? 'font-semibold text-fg' : 'text-muted')}>
          <span className={cx('truncate', isTyping && 'font-medium text-accent')}>{preview}</span>
          {!isTyping && conversation.lastMessage && (
            <span className="shrink-0 whitespace-pre text-muted"> · {timeAgo(conversation.lastMessage.createdAt, now)}</span>
          )}
        </div>
      </div>

      <div className="pointer-events-none flex shrink-0 items-center gap-2">
        {conversation.muted && <BellOff size={15} className="text-muted" aria-label="Muted" />}
        {unread && <span aria-hidden className="size-2.5 rounded-full bg-accent" />}
      </div>
    </div>
  )
}
