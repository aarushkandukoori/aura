/**
 * "typing..." indicators. They only matter for a few seconds, so they live in memory, not in the
 * database, kept apart per world. Conversation DTOs read typingIn() to list who is typing right now.
 */
import { worldState } from '../db/index.ts'
import { broadcast } from '../live.ts'

/** Per world: conversationId -> (accountId -> timer that clears the indicator if nobody else does). */
const typersOf = worldState(() => new Map<string, Map<string, ReturnType<typeof setTimeout>>>())

/** Nobody types forever: an indicator clears itself after this long, even if the sim forgets. */
const TYPING_TIMEOUT_MS = 12_000

/** Show or hide "typing..." for one account in one conversation, and tell every open app. */
export function setTyping(conversationId: string, accountId: string, typing: boolean): void {
  const typers = typersOf()
  let members = typers.get(conversationId)
  const oldTimer = members?.get(accountId)
  if (oldTimer) clearTimeout(oldTimer)

  if (typing) {
    if (!members) {
      members = new Map()
      typers.set(conversationId, members)
    }
    // The timer runs inside the current world (timers keep it), so it clears the right indicator.
    const timer = setTimeout(() => setTyping(conversationId, accountId, false), TYPING_TIMEOUT_MS)
    timer.unref() // a pending indicator should never keep the process alive
    members.set(accountId, timer)
    if (!oldTimer) broadcast({ type: 'typing', conversationId, accountId, typing: true })
    return
  }

  if (members?.delete(accountId)) {
    if (members.size === 0) typers.delete(conversationId)
    broadcast({ type: 'typing', conversationId, accountId, typing: false })
  }
}

/** Ids of everyone typing in this conversation right now. */
export function typingIn(conversationId: string): string[] {
  return [...(typersOf().get(conversationId)?.keys() ?? [])]
}

/** Forget a conversation's indicators (it was deleted) without broadcasting. */
export function forgetTyping(conversationId: string): void {
  const typers = typersOf()
  for (const timer of typers.get(conversationId)?.values() ?? []) clearTimeout(timer)
  typers.delete(conversationId)
}

/** Forget every indicator of the current world (Settings > Start over). */
export function clearAllTyping(): void {
  for (const conversationId of [...typersOf().keys()]) forgetTyping(conversationId)
}
