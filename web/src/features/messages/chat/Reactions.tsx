/**
 * Emoji reactions on a message: the little pill under the bubble, the sheet that shows who reacted,
 * and the quick picker (❤️😂😮😢😡👍) that opens on hover or long-press.
 */
import { Copy, Reply } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Avatar, Sheet, toast } from '../../../components'
import { cx } from '../../../lib/cx'
import { useEscapeKey } from '../../../lib/hooks'
import { useMe } from '../../../lib/store'
import type { Account, Message } from '../../../lib/types'
import { QUICK_REACTIONS } from '../emoji'
import { myReaction, setMyReaction } from './send'

interface ReactionPillProps {
  message: Message
  mine: boolean
  /** Everyone in the chat except me, to put names to the reactions. */
  members: Account[]
}

/** "❤️😂 2" under a bubble. Tapping it shows who reacted, and lets me take mine back. */
export function ReactionPill({ message, mine, members }: ReactionPillProps) {
  const [open, setOpen] = useState(false)
  // Reactions already there when the chat opened just show; ones that arrive while watching pop in.
  const [hadReactionsAtStart] = useState(message.reactions.length > 0)
  const me = useMe()
  if (message.reactions.length === 0) return null

  const emojis = [...new Set(message.reactions.map((reaction) => reaction.emoji))].slice(0, 3)
  const count = message.reactions.length
  const mineEmoji = myReaction(message)
  const people = message.reactions.map((reaction) => ({
    reaction,
    account: reaction.accountId === 'me' ? me : members.find((member) => member.id === reaction.accountId) ?? null,
  }))

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Reactions: ${message.reactions.map((reaction) => reaction.emoji).join(' ')}`}
        className={cx(
          'relative z-[1] -mt-2 flex h-6 items-center gap-0.5 rounded-full border-2 border-bg bg-surface-2 px-1.5 text-[13px] leading-none shadow-sm',
          mine ? 'mr-2.5' : 'ml-2.5',
        )}
        initial={hadReactionsAtStart ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 14, stiffness: 420 }}
      >
        {emojis.map((emoji) => (
          <span key={emoji}>{emoji}</span>
        ))}
        {count > 1 && <span className="ml-0.5 text-[11px] font-semibold text-muted">{count}</span>}
      </motion.button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Reactions">
        <ul className="py-2">
          {people.map(({ reaction, account }) => {
            const isMe = reaction.accountId === 'me'
            return (
              <li key={reaction.accountId}>
                <button
                  type="button"
                  disabled={!isMe}
                  onClick={() => {
                    setOpen(false)
                    setMyReaction(message, null)
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left enabled:hover:bg-surface"
                >
                  <Avatar account={account} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{isMe ? 'You' : account?.displayName ?? 'Someone'}</span>
                    <span className="block truncate text-[13px] text-muted">{isMe ? 'Tap to remove' : account?.username}</span>
                  </span>
                  <span className="text-[26px] leading-none">{reaction.emoji}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {mineEmoji === null && <p className="px-4 pb-4 text-center text-[13px] text-muted">Double tap a message to react with ❤️</p>}
      </Sheet>
    </>
  )
}

interface ReactionPickerProps {
  message: Message
  mine: boolean
  /** Open below the bubble instead of above (the bubble is at the top of the chat). */
  below: boolean
  onReply: () => void
  onClose: () => void
}

/** The floating bar of quick reactions, plus Reply and Copy. Choosing my current reaction again removes it. */
export function ReactionPicker({ message, mine, below, onReply, onClose }: ReactionPickerProps) {
  const panel = useRef<HTMLDivElement>(null)
  const current = myReaction(message)
  useEscapeKey(onClose)

  // Close on a tap anywhere else.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  const pick = (emoji: string) => {
    onClose()
    setMyReaction(message, emoji === current ? null : emoji)
  }
  const copy = async () => {
    onClose()
    try {
      await navigator.clipboard.writeText(message.text)
      toast('Copied')
    } catch {
      toast("Couldn't copy that message")
    }
  }

  return (
    <motion.div
      ref={panel}
      role="menu"
      aria-label="React to message"
      className={cx(
        'absolute z-30 flex items-center gap-0.5 rounded-full border border-line bg-elevated p-1 shadow-pop',
        below ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
        mine ? 'right-0' : 'left-0',
      )}
      initial={{ opacity: 0, scale: 0.85, y: below ? -6 : 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 22, stiffness: 420 }}
      style={{ transformOrigin: `${mine ? 'right' : 'left'} ${below ? 'top' : 'bottom'}` }}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitem"
          aria-label={`React with ${emoji}`}
          onClick={() => pick(emoji)}
          className={cx('grid size-9 place-items-center rounded-full text-[22px] transition-transform hover:scale-125', emoji === current && 'bg-accent-soft')}
        >
          {emoji}
        </button>
      ))}
      <span aria-hidden className="mx-0.5 h-6 w-px bg-line" />
      <button
        type="button"
        role="menuitem"
        aria-label="Reply"
        title="Reply"
        onClick={() => {
          onClose()
          onReply()
        }}
        className="grid size-9 place-items-center rounded-full text-fg hover:bg-surface"
      >
        <Reply size={18} />
      </button>
      {message.text && (
        <button type="button" role="menuitem" aria-label="Copy" title="Copy" onClick={copy} className="grid size-9 place-items-center rounded-full text-fg hover:bg-surface">
          <Copy size={16} />
        </button>
      )}
    </motion.div>
  )
}
