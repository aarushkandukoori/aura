import { Image as ImageIcon, Reply, SendHorizontal, Smile, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { IconButton, toast } from '../../../components'
import { cx } from '../../../lib/cx'
import { firstName } from '../../../lib/format'
import { useIsMobile } from '../../../lib/hooks'
import { useMe } from '../../../lib/store'
import type { ID, Message } from '../../../lib/types'
import { quoteText } from '../preview'
import { EmojiPicker } from './EmojiPicker'
import { sendDraft, type PickedPhoto } from './send'

/** Unsent text per chat, so switching chats (or leaving Messages) never loses a half-written message. */
const drafts = new Map<ID, string>()

/** About five lines; after that the box scrolls. */
const MAX_HEIGHT_PX = 132

interface ComposerProps {
  conversationId: ID
  replyTo: Message | null
  onCancelReply: () => void
  /** Until the chat has loaded, sending waits. */
  disabled: boolean
}

/**
 * The message box: emoji picker, a text area that grows as you type (Enter sends, Shift+Enter adds
 * a line), a photo button with a preview, the "Replying to" chip, and Send (disabled while empty).
 */
export function Composer({ conversationId, replyTo, onCancelReply, disabled }: ComposerProps) {
  const me = useMe()
  const isMobile = useIsMobile()
  const [text, setText] = useState(() => drafts.get(conversationId) ?? '')
  const [photo, setPhoto] = useState<PickedPhoto | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    drafts.set(conversationId, text)
  }, [conversationId, text])

  // Grow with the text, up to MAX_HEIGHT_PX.
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`
  }, [text])

  // Desktop: ready to type as soon as a chat opens (phones wait for a tap, so no keyboard pops up).
  useEffect(() => {
    if (!isMobile) box.current?.focus()
  }, [isMobile])
  // Picking "Reply" puts the cursor in the box.
  useEffect(() => {
    if (replyTo) box.current?.focus()
  }, [replyTo])

  // A photo picked but never sent: free its preview when leaving the chat.
  const unsentPhoto = useRef<PickedPhoto | null>(null)
  useEffect(() => {
    unsentPhoto.current = photo
  }, [photo])
  useEffect(() => () => {
    if (unsentPhoto.current) URL.revokeObjectURL(unsentPhoto.current.url)
  }, [])

  const canSend = !disabled && (text.trim() !== '' || photo !== null)

  async function send() {
    if (!canSend) return
    const draft = { text: text.trim(), photo, replyTo }
    setText('')
    setPhoto(null)
    setEmojiOpen(false)
    onCancelReply()
    try {
      await sendDraft(conversationId, me, draft)
    } catch {
      // Put the message back so nothing typed is lost (unless something new was typed meanwhile).
      setText((current) => current || draft.text)
      setPhoto((current) => current ?? draft.photo)
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('You can send photos here')
      return
    }
    const url = URL.createObjectURL(file)
    const size = await readImageSize(url)
    setPhoto((previous) => {
      if (previous) URL.revokeObjectURL(previous.url)
      return { file, url, ...size }
    })
    box.current?.focus()
  }

  function removePhoto() {
    if (photo) URL.revokeObjectURL(photo.url)
    setPhoto(null)
  }

  function insertEmoji(emoji: string) {
    const element = box.current
    const start = element?.selectionStart ?? text.length
    const end = element?.selectionEnd ?? text.length
    setText(text.slice(0, start) + emoji + text.slice(end))
    // After React puts the new text in, move the cursor past the emoji (and, on desktop, back into
    // the box so typing continues; phones keep the keyboard closed while picking).
    requestAnimationFrame(() => {
      if (!isMobile) element?.focus()
      element?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: the Enter that confirms a word in Japanese / Chinese input must not send.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send()
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const image = [...event.clipboardData.files].find((file) => file.type.startsWith('image/'))
    if (!image) return
    event.preventDefault()
    pickPhoto(image)
  }

  return (
    <div className="shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-1 md:px-4 md:pb-4">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2.5 rounded-2xl bg-surface py-2 pl-3.5 pr-1.5">
          <Reply size={16} className="shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">
              Replying to {replyTo.sender.kind === 'me' ? 'yourself' : firstName(replyTo.sender.displayName)}
            </div>
            <div className="truncate text-[13px] text-muted">{quoteText(replyTo)}</div>
          </div>
          <IconButton label="Cancel reply" size="sm" onClick={onCancelReply}>
            <X size={16} />
          </IconButton>
        </div>
      )}

      {photo && (
        <div className="mb-2 flex">
          <div className="relative">
            <img src={photo.url} alt="Photo to send" className="h-24 max-w-[180px] rounded-xl border border-line object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={removePhoto}
              className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-fg text-bg shadow-pop"
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      <div className="relative flex items-end gap-0.5 rounded-[24px] border border-line bg-bg px-1.5 py-1 transition-colors focus-within:border-line-strong">
        <IconButton label="Emoji" data-emoji-toggle aria-expanded={emojiOpen} onClick={() => setEmojiOpen((open) => !open)}>
          <Smile size={24} strokeWidth={1.75} />
        </IconButton>
        <textarea
          ref={box}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          maxLength={2000}
          placeholder="Message..."
          aria-label="Message"
          enterKeyHint="send"
          className="min-w-0 flex-1 resize-none bg-transparent py-[9px] text-[15px] leading-[22px] outline-none placeholder:text-muted"
        />
        <IconButton label="Send a photo" onClick={() => fileInput.current?.click()}>
          <ImageIcon size={24} strokeWidth={1.75} />
        </IconButton>
        <button
          type="button"
          aria-label="Send"
          title="Send"
          disabled={!canSend}
          onClick={send}
          className={cx(
            'my-0.5 grid size-9 shrink-0 place-items-center rounded-full transition-colors',
            canSend ? 'bg-accent text-white hover:bg-accent-hover' : 'text-muted opacity-50',
          )}
        >
          <SendHorizontal size={18} strokeWidth={2.25} />
        </button>
        {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            pickPhoto(event.target.files?.[0])
            event.target.value = '' // picking the same file again still fires onChange
          }}
        />
      </div>
    </div>
  )
}

/** A picked photo's pixel size, so its bubble has the right shape before it finishes uploading. */
async function readImageSize(url: string): Promise<{ width: number; height: number }> {
  const image = new Image()
  image.src = url
  try {
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  } catch {
    return { width: 0, height: 0 }
  }
}
