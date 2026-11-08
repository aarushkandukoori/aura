/**
 * Turns a chat's messages into what the list draws: time separators after quiet gaps, and messages
 * marked as the first / last of a run (consecutive bubbles from the same person). Runs decide the
 * bubble corners, where the avatar goes (last of a run) and where a group shows the name (first).
 */
import type { Message } from '../../../lib/types'

/** A new time separator (and a new run) after 15 quiet minutes. */
const QUIET_GAP_MS = 15 * 60_000

export type ChatItem =
  | { kind: 'time'; key: string; at: number }
  | { kind: 'message'; key: string; message: Message; mine: boolean; first: boolean; last: boolean }

export function buildChatItems(messages: Message[]): ChatItem[] {
  const items: ChatItem[] = []
  messages.forEach((message, index) => {
    const previous = messages[index - 1]
    const next = messages[index + 1]
    const startsNewTime = !previous || message.createdAt - previous.createdAt >= QUIET_GAP_MS
    const nextStartsNewTime = !next || next.createdAt - message.createdAt >= QUIET_GAP_MS

    if (startsNewTime) items.push({ kind: 'time', key: `time-${message.id}`, at: message.createdAt })
    items.push({
      kind: 'message',
      key: message.id,
      message,
      mine: message.sender.kind === 'me',
      first: startsNewTime || previous.sender.id !== message.sender.id,
      last: nextStartsNewTime || next.sender.id !== message.sender.id,
    })
  })
  return items
}
