/**
 * Sending messages and reactions with instant feedback: the bubble appears at once (a temporary
 * "temp-N" message), then is swapped for the server's copy. On failure it is taken back.
 */
import { toast } from '../../../components'
import { api } from '../../../lib/api'
import { useStore } from '../../../lib/store'
import type { Account, ID, Media, Message } from '../../../lib/types'
import { uploadMedia } from '../../../lib/upload'
import { isTemp, quoteText } from '../preview'

/** A photo picked in the composer, with a local preview URL and its size (for the bubble's shape). */
export interface PickedPhoto {
  file: File
  url: string
  width: number
  height: number
}

export interface Draft {
  text: string
  photo: PickedPhoto | null
  replyTo: Message | null
}

let tempCount = 0

/**
 * Send a text and/or photo. Throws (after taking the bubble back) when it fails; the photo's preview
 * URL then stays valid so the composer can put the draft back.
 */
export async function sendDraft(conversationId: ID, me: Account, draft: Draft): Promise<void> {
  const store = useStore.getState()
  const before = store.conversations[conversationId]
  const tempId = `temp-${++tempCount}`
  const localMedia: Media | null = draft.photo
    ? { url: draft.photo.url, type: 'image', width: draft.photo.width || null, height: draft.photo.height || null }
    : null

  store.addMessage({
    id: tempId,
    conversationId,
    sender: me,
    text: draft.text,
    media: localMedia,
    sharedPost: null,
    story: null,
    replyTo: draft.replyTo
      ? { id: draft.replyTo.id, text: quoteText(draft.replyTo), senderName: draft.replyTo.sender.kind === 'me' ? 'You' : draft.replyTo.sender.displayName }
      : null,
    reactions: [],
    createdAt: Date.now(),
  })
  const stopWatching = dropTempOnEcho(conversationId, tempId, draft.text)

  try {
    const media = draft.photo ? await uploadMedia(draft.photo.file) : null
    const sent = await api.sendMessage(conversationId, { text: draft.text, media, replyToId: draft.replyTo?.id ?? null })
    stopWatching()
    const latest = useStore.getState()
    latest.replaceMessage(conversationId, tempId, sent)
    // Usually the live event has already updated the inbox preview; if not, point it at the real message.
    const conversation = latest.conversations[conversationId]
    if (conversation?.lastMessage?.id === tempId) {
      latest.upsertConversation({ ...conversation, lastMessage: sent, lastMessageAt: sent.createdAt })
    }
    if (draft.photo) URL.revokeObjectURL(draft.photo.url) // the bubble now shows the uploaded copy
  } catch (cause) {
    stopWatching()
    const latest = useStore.getState()
    latest.removeMessage(conversationId, tempId)
    // The inbox preview showed the unsent text: put the previous last message back.
    const conversation = latest.conversations[conversationId]
    if (before && conversation?.lastMessage?.id === tempId) {
      latest.upsertConversation({ ...conversation, lastMessage: before.lastMessage, lastMessageAt: before.lastMessageAt })
    }
    toast(cause instanceof Error ? cause.message : "Couldn't send your message")
    throw cause
  }
}

/**
 * The server announces my message on the live stream a moment before the send request returns.
 * The moment that copy lands in the store, drop the temporary bubble, so the two never show
 * together (not even for a frame). Returns a function that stops watching.
 */
function dropTempOnEcho(conversationId: ID, tempId: ID, text: string): () => void {
  const known = new Set((useStore.getState().messages[conversationId] ?? []).map((message) => message.id))
  const stop = useStore.subscribe((state) => {
    const list = state.messages[conversationId] ?? []
    const echo = list.some((message) => !known.has(message.id) && !isTemp(message) && message.sender.kind === 'me' && message.text === text)
    if (!echo) return
    stop()
    if (list.some((message) => message.id === tempId)) useStore.getState().removeMessage(conversationId, tempId)
  })
  return stop
}

/** Set my reaction on a message (null removes it). Shows at once, then matches the server. */
export async function setMyReaction(message: Message, emoji: string | null): Promise<void> {
  const store = useStore.getState()
  // Use the freshest copy: someone else may have reacted since this bubble rendered.
  const current = store.messages[message.conversationId]?.find((m) => m.id === message.id) ?? message
  const others = current.reactions.filter((reaction) => reaction.accountId !== 'me')
  store.updateMessageReactions(message.conversationId, message.id, emoji ? [...others, { accountId: 'me', emoji }] : others)
  try {
    const reactions = await api.reactToMessage(message.id, emoji)
    useStore.getState().updateMessageReactions(message.conversationId, message.id, reactions)
  } catch {
    useStore.getState().updateMessageReactions(message.conversationId, message.id, current.reactions)
    toast("Couldn't react to that message")
  }
}

/** My current reaction on a message, if any. */
export function myReaction(message: Message): string | null {
  return message.reactions.find((reaction) => reaction.accountId === 'me')?.emoji ?? null
}
