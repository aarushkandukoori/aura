import { Heart } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import type { Story } from '../../lib/types'

const QUICK_REACTIONS = ['😂', '😮', '😍', '😢', '👏', '🔥', '🎉', '💯']

interface StoryReplyBarProps {
  story: Story
  /** true while the reply box has focus: the story waits for you. */
  onBusyChange: (busy: boolean) => void
}

/**
 * "Reply to maya…" under someone else's story, a heart, and quick reactions (shown while the box
 * is focused and empty). Replies and reactions arrive in your DMs with them, with the story attached.
 */
export function StoryReplyBar({ story, onBusyChange }: StoryReplyBarProps) {
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [flying, setFlying] = useState<{ emoji: string; id: number } | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)

  // Leaving (next person, closing) must never leave the story stuck on pause.
  useEffect(() => () => {
    window.clearTimeout(noticeTimer.current)
    onBusyChange(false)
  }, [onBusyChange])

  function showNotice(message: string) {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 1600)
  }

  function changeFocus(value: boolean) {
    setFocused(value)
    onBusyChange(value)
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault()
    const reply = text.trim()
    if (!reply) return
    setText('')
    input.current?.blur()
    try {
      await api.replyToStory(story.id, reply)
      showNotice('Message sent')
    } catch {
      showNotice("Couldn't send. Try again.")
    }
  }

  async function react(emoji: string) {
    input.current?.blur()
    setFlying({ emoji, id: Date.now() })
    try {
      await api.reactToStory(story.id, emoji)
      showNotice('Reaction sent')
    } catch {
      showNotice("Couldn't send. Try again.")
    }
  }

  return (
    <>
      <AnimatePresence>
        {focused && !text && (
          // Taller than the card on purpose: the card clips it, so the whole story dims while you type.
          <motion.div
            key="reactions"
            className="absolute inset-x-0 bottom-full flex h-[100dvh] flex-col items-center justify-end bg-black/60 pb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <p className="mb-3 text-sm font-semibold">Quick reactions</p>
            <div className="grid grid-cols-4 gap-x-6 gap-y-3">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`React with ${emoji}`}
                  // Keep the reply box focused until the click lands, or the panel would vanish first.
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => react(emoji)}
                  className="grid size-12 place-items-center text-[34px] transition hover:scale-110 active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={sendReply} className="relative flex items-center gap-2 px-3 pb-[max(env(safe-area-inset-bottom),14px)] pt-3">
        <input
          ref={input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => changeFocus(true)}
          onBlur={() => changeFocus(false)}
          placeholder={`Reply to ${story.author.username}…`}
          aria-label={`Reply to ${story.author.username}`}
          maxLength={1000}
          autoComplete="off"
          enterKeyHint="send"
          className="h-11 min-w-0 flex-1 rounded-full border border-white/55 bg-transparent px-4 text-sm text-white outline-none transition-colors placeholder:text-white/80 focus:border-white"
        />
        {text.trim() ? (
          <button type="submit" className="h-11 px-2 text-[15px] font-semibold">
            Send
          </button>
        ) : (
          <button type="button" aria-label="Send a heart" onClick={() => react('❤️')} className="grid size-11 place-items-center transition active:scale-90">
            <Heart size={26} strokeWidth={1.75} />
          </button>
        )}
      </form>

      <AnimatePresence>
        {flying && (
          <motion.span
            key={flying.id}
            aria-hidden
            className="pointer-events-none absolute bottom-20 left-1/2 text-6xl"
            initial={{ x: '-50%', y: 0, scale: 0.6, opacity: 0 }}
            animate={{ y: -280, scale: 1.4, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            onAnimationComplete={() => setFlying(null)}
          >
            {flying.emoji}
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {notice && (
          <motion.p
            key="notice"
            role="status"
            className="pointer-events-none absolute bottom-24 left-0 right-0 mx-auto w-fit rounded-full bg-black/75 px-4 py-2 text-sm font-medium"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {notice}
          </motion.p>
        )}
      </AnimatePresence>
    </>
  )
}
