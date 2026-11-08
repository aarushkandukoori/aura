import type { Account, Conversation } from '../../../lib/types'

/** Something a post can be shared to: an existing chat, or a person I have no chat with yet. */
export type ShareTarget =
  | { key: string; kind: 'conversation'; conversation: Conversation }
  | { key: string; kind: 'person'; account: Account }

/**
 * The share grid: these chats first, then these people. Someone I already have a DM with shows up
 * as that DM (looked up in `allChats`), and nobody appears twice.
 */
export function buildShareTargets(conversations: Conversation[], people: Account[], allChats: Conversation[]): ShareTarget[] {
  const dmByPerson = new Map<string, Conversation>()
  for (const chat of allChats) {
    if (chat.kind === 'dm' && chat.members[0]) dmByPerson.set(chat.members[0].id, chat)
  }

  const targets: ShareTarget[] = []
  const seen = new Set<string>()
  const add = (target: ShareTarget) => {
    if (seen.has(target.key)) return
    seen.add(target.key)
    targets.push(target)
  }

  for (const conversation of conversations) add({ key: `c:${conversation.id}`, kind: 'conversation', conversation })
  for (const account of people) {
    if (account.kind === 'me') continue
    const dm = dmByPerson.get(account.id)
    add(dm ? { key: `c:${dm.id}`, kind: 'conversation', conversation: dm } : { key: `a:${account.id}`, kind: 'person', account })
  }
  return targets
}
