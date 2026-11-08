import { ArrowDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Skeleton, Spinner, toast } from '../../../components'
import { chatTime, timeAgoLong } from '../../../lib/format'
import { useTyping } from '../../../lib/store'
import type { Conversation, ID, Message } from '../../../lib/types'
import { useNow } from '../data'
import { isTemp, typingMembers } from '../preview'
import { ChatIntro } from './ChatIntro'
import { buildChatItems } from './grouping'
import { MessageRow } from './MessageRow'
import { TypingBubbles } from './TypingBubble'

interface MessageListProps {
  conversation: Conversation
  /** undefined while the first page loads. */
  messages: Message[] | undefined
  hasOlder: boolean
  loadingOlder: boolean
  onLoadOlder: () => void
  onReply: (message: Message) => void
  error: string | null
  onRetry: () => void
}

/** Within this many px of the bottom counts as "reading the newest messages". */
const NEAR_BOTTOM_PX = 80

/** What the list looked like after the last change, to tell what just changed. */
interface Measured {
  firstId: ID | undefined
  lastId: ID | undefined
  /** scrollHeight and clientHeight of the scroller. 0 = nothing measured yet. */
  height: number
  clientHeight: number
}

/**
 * Was the reader at the bottom before the latest change? Uses the sizes from *before* the change
 * (the scroll position itself doesn't move when content is added), so it never depends on when the
 * browser gets around to firing scroll events.
 */
function wasNearBottom(before: Measured, scrollTop: number): boolean {
  return before.height === 0 || before.height - scrollTop - before.clientHeight < NEAR_BOTTOM_PX
}

/**
 * The scrolling chat. It opens at the newest message and stays pinned there while new messages,
 * photos and typing dots arrive, unless you scrolled up to read (then a "New messages" chip shows).
 * Scrolling near the top loads older messages without moving what you are reading.
 */
export function MessageList({ conversation, messages, hasOlder, loadingOlder, onLoadOlder, onReply, error, onRetry }: MessageListProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const measured = useRef<Measured>({ firstId: undefined, lastId: undefined, height: 0, clientHeight: 0 })
  const [showNewChip, setShowNewChip] = useState(false)
  const [highlightId, setHighlightId] = useState<ID | null>(null)
  const [openedAt] = useState(() => Date.now())
  const typers = typingMembers(conversation, useTyping(conversation.id))
  const now = useNow(30_000)
  const items = useMemo(() => buildChatItems(messages ?? []), [messages])
  const firstId = messages?.[0]?.id
  const lastMessage = messages?.at(-1)

  function remember(element: HTMLElement) {
    measured.current = { firstId, lastId: lastMessage?.id, height: element.scrollHeight, clientHeight: element.clientHeight }
  }

  // After every render: keep the reader where they belong.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    const before = measured.current
    const atBottom = wasNearBottom(before, element.scrollTop)
    const newLast = before.lastId !== undefined && lastMessage && lastMessage.id !== before.lastId ? lastMessage : null
    const resized = element.scrollHeight !== before.height || element.clientHeight !== before.clientHeight

    // A render where nothing moved (a highlight, an open picker...) leaves the scroll alone.
    if (resized || newLast) {
      if (before.firstId && firstId !== before.firstId && !atBottom) {
        // Older messages were added above: shift by their height so the same messages stay in view.
        element.scrollTop += element.scrollHeight - before.height
      } else if (atBottom || newLast?.sender.kind === 'me') {
        // Reading at the bottom (or I just sent something): show the newest message.
        element.scrollTop = element.scrollHeight
      } else if (newLast) {
        // Reading further up: don't yank the view, just offer a way down.
        setShowNewChip(true)
      }
    }
    remember(element)
  })

  // Sizes also change outside React renders (a photo finishes loading, the window or composer
  // resizes): stay pinned to the bottom through those too.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element || !content.current) return
    const observer = new ResizeObserver(() => {
      if (wasNearBottom(measured.current, element.scrollTop)) element.scrollTop = element.scrollHeight
      measured.current = { ...measured.current, height: element.scrollHeight, clientHeight: element.clientHeight }
    })
    observer.observe(content.current)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function onScroll() {
    const element = scroller.current
    if (!element) return
    if (element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX) setShowNewChip(false)
    if (element.scrollTop < 400 && hasOlder && !loadingOlder) onLoadOlder()
  }

  function jumpTo(messageId: ID) {
    const target = scroller.current?.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)
    if (!target) {
      toast('That message is further back in the chat')
      return
    }
    // An instant jump (not smooth): older messages may load in above while we land, and the list
    // keeps an instantly-placed message in view, where a running smooth scroll would overshoot.
    target.scrollIntoView({ block: 'center' })
    setHighlightId(messageId)
    window.setTimeout(() => setHighlightId((current) => (current === messageId ? null : current)), 1600)
  }

  // "Seen just now" / "Sent" under my last message in a DM ("Sending..." while it uploads).
  let status: { id: ID; label: string } | null = null
  if (lastMessage?.sender.kind === 'me') {
    if (isTemp(lastMessage)) status = { id: lastMessage.id, label: 'Sending...' }
    else if (conversation.kind === 'dm') {
      const seenAt = conversation.seenAt
      status = { id: lastMessage.id, label: seenAt !== null && seenAt >= lastMessage.createdAt ? `Seen ${timeAgoLong(seenAt, now)}` : 'Sent' }
    }
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        data-chat-scroll
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain px-3 [overflow-anchor:none] md:px-5"
      >
        <div ref={content} className="flex min-h-full flex-col pb-3 pt-2">
          {messages === undefined ? (
            error ? (
              <div className="m-auto flex flex-col items-center gap-3 px-6 text-center">
                <p className="text-sm text-muted">Couldn't load this chat. {error}</p>
                <Button variant="secondary" onClick={onRetry}>Try again</Button>
              </div>
            ) : (
              <ChatSkeleton />
            )
          ) : (
            <>
              {hasOlder ? (
                <div className="flex h-12 shrink-0 items-center justify-center text-muted">{loadingOlder && <Spinner size={20} />}</div>
              ) : (
                <ChatIntro conversation={conversation} />
              )}
              {/* Pushes a short chat down to the composer, like a native messages app. */}
              <div className="flex-1" />
              {items.map((item) =>
                item.kind === 'time' ? (
                  <div key={item.key} className="mb-1 mt-5 text-center text-xs font-medium text-muted">
                    {chatTime(item.at, now)}
                  </div>
                ) : (
                  <MessageRow
                    key={item.key}
                    message={item.message}
                    conversation={conversation}
                    mine={item.mine}
                    first={item.first}
                    last={item.last}
                    status={status?.id === item.message.id ? status.label : null}
                    highlighted={highlightId === item.message.id}
                    animate={item.message.createdAt > openedAt && (!item.mine || isTemp(item.message))}
                    onReply={onReply}
                    onJumpTo={jumpTo}
                  />
                ),
              )}
              <TypingBubbles typers={typers} />
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showNewChip && (
          <motion.button
            type="button"
            onClick={() => {
              scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
              setShowNewChip(false)
            }}
            className="absolute bottom-3 left-1/2 z-10 flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-semibold text-white shadow-pop"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <ArrowDown size={15} strokeWidth={2.5} />
            New messages
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Gray bubbles while a chat loads for the first time. */
function ChatSkeleton() {
  const rows = [
    { mine: false, width: 'w-40' },
    { mine: false, width: 'w-56' },
    { mine: true, width: 'w-44' },
    { mine: false, width: 'w-32' },
    { mine: true, width: 'w-52' },
    { mine: true, width: 'w-28' },
  ]
  return (
    <div aria-hidden className="mt-auto flex flex-col gap-2 pb-2">
      {rows.map((row, index) => (
        <div key={index} className={row.mine ? 'flex justify-end' : 'flex items-end gap-2'}>
          {!row.mine && <Skeleton circle className="size-7" />}
          <Skeleton className={`h-9 rounded-[20px] ${row.width}`} />
        </div>
      ))}
    </div>
  )
}
