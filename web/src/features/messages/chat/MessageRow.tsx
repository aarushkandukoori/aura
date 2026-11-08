import { Reply, SmilePlus } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState } from 'react'
import { Avatar } from '../../../components'
import { cx } from '../../../lib/cx'
import { firstName } from '../../../lib/format'
import { useMe } from '../../../lib/store'
import type { Conversation, ID, Message } from '../../../lib/types'
import { QUICK_REACTIONS } from '../emoji'
import { isStoryReaction, isTemp } from '../preview'
import { ReplyQuote, TextBubble } from './bubbles'
import { PhotoBubble, SharedPostCard, StoryReply } from './MediaBubbles'
import { ReactionPicker, ReactionPill } from './Reactions'
import { myReaction, setMyReaction } from './send'
import { useLongPress } from './useLongPress'

interface MessageRowProps {
  message: Message
  conversation: Conversation
  mine: boolean
  /** First / last bubble of a run from the same person (see grouping.ts). */
  first: boolean
  last: boolean
  /** "Seen just now" / "Sent" / "Sending..." under my last message. */
  status: string | null
  /** Briefly outlined after jumping here from a reply quote. */
  highlighted: boolean
  /** Slide in: the message arrived while the chat was open. */
  animate: boolean
  onReply: (message: Message) => void
  onJumpTo: (messageId: ID) => void
}

/**
 * One message: the avatar (theirs, last of a run), the sender's name (groups), the content (reply
 * quote, story reply, shared post, photo, text), reactions, and on hover / long-press the reaction
 * picker. Double tap anything to send a heart.
 */
export function MessageRow({ message, conversation, mine, first, last, status, highlighted, animate, onReply, onJumpTo }: MessageRowProps) {
  const me = useMe()
  const row = useRef<HTMLDivElement>(null)
  const [picker, setPicker] = useState<{ below: boolean } | null>(null)
  const sending = isTemp(message)
  const isGroup = conversation.kind === 'group'

  const heart = () => {
    if (!sending && myReaction(message) !== QUICK_REACTIONS[0]) setMyReaction(message, QUICK_REACTIONS[0])
  }
  const openPicker = () => {
    if (sending) return
    // At the very top of the chat there's no room above the bubble, so the picker opens below it.
    const scroller = row.current?.closest('[data-chat-scroll]')
    const rowTop = row.current?.getBoundingClientRect().top ?? 0
    setPicker({ below: scroller ? rowTop - scroller.getBoundingClientRect().top < 64 : false })
  }
  const longPress = useLongPress(openPicker)

  const showText = message.text !== '' && !isStoryReaction(message)
  const empty = !showText && !message.media && !message.sharedPost && !message.story
  const hasReactions = message.reactions.length > 0

  return (
    <motion.div
      ref={row}
      data-message-id={message.id}
      className={cx('group/row flex items-end gap-2', mine && 'flex-row-reverse', first ? 'mt-3' : 'mt-0.5')}
      initial={animate ? { opacity: 0, y: 12, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {!mine && (
        // Their picture sits next to the last bubble of a run (lifted above the reaction pill).
        <div className={cx('flex w-7 shrink-0', hasReactions && 'mb-4')}>
          {last && <Avatar account={message.sender} size={28} link />}
        </div>
      )}

      <div className={cx('flex min-w-0 max-w-[78%] flex-col md:max-w-[65%]', mine ? 'items-end' : 'items-start')}>
        {isGroup && !mine && first && <span className="mb-1 px-3 text-xs text-muted">{firstName(message.sender.displayName)}</span>}

        <div className={cx('relative flex max-w-full items-center gap-1', mine && 'flex-row-reverse')}>
          <div
            {...longPress}
            className={cx(
              'relative flex min-w-0 max-w-full flex-col gap-1 rounded-[20px] transition-shadow duration-300 [-webkit-touch-callout:none] pointer-coarse:select-none',
              mine ? 'items-end' : 'items-start',
              highlighted && 'ring-2 ring-accent/60 ring-offset-2 ring-offset-bg',
            )}
          >
            <ReplyQuote message={message} mine={mine} isGroup={isGroup} onJump={() => message.replyTo && onJumpTo(message.replyTo.id)} />
            {message.story && <StoryReply message={message} mine={mine} owner={mine ? conversation.members[0] ?? me : me} onDoubleTap={heart} />}
            {message.sharedPost && <SharedPostCard post={message.sharedPost} onDoubleTap={heart} />}
            {message.media && <PhotoBubble media={message.media} sending={sending} onDoubleTap={heart} />}
            {showText && <TextBubble text={message.text} mine={mine} first={first} last={last} onDoubleTap={heart} />}
            {empty && <div className="rounded-[20px] border border-line px-3.5 py-2 text-[13px] italic text-muted">This message is no longer available</div>}
          </div>

          {!sending && (
            // Desktop: small React / Reply buttons appear beside the bubble on hover.
            <div className={cx('flex shrink-0 items-center text-muted transition-opacity pointer-coarse:hidden', picker ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/row:opacity-100')}>
              <button type="button" aria-label="React" title="React" onClick={openPicker} className="grid size-8 place-items-center rounded-full hover:bg-surface hover:text-fg">
                <SmilePlus size={17} />
              </button>
              <button type="button" aria-label="Reply" title="Reply" onClick={() => onReply(message)} className="grid size-8 place-items-center rounded-full hover:bg-surface hover:text-fg">
                <Reply size={17} />
              </button>
            </div>
          )}

          {picker && <ReactionPicker message={message} mine={mine} below={picker.below} onReply={() => onReply(message)} onClose={() => setPicker(null)} />}
        </div>

        <ReactionPill message={message} mine={mine} members={conversation.members} />
        {status && <span className="mt-1 px-1 text-[11px] font-medium text-muted">{status}</span>}
      </div>
    </motion.div>
  )
}
