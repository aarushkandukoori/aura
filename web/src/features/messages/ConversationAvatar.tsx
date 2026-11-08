import { Avatar, AvatarPair } from '../../components'
import { isActiveNow } from '../../lib/format'
import { useStore } from '../../lib/store'
import type { Conversation } from '../../lib/types'

interface ConversationAvatarProps {
  conversation: Conversation
  /** Picture diameter in px. */
  size: number
  /** DMs: story ring (opens their story when clicked). Group pictures get the same outer size, so rows line up. */
  story?: boolean
  /** Green dot when the person (or anyone in the group) is active right now. */
  showActive?: boolean
}

/** Space the Avatar's story ring adds around the picture (matches components/Avatar). */
function ringSpace(size: number): number {
  return size >= 60 ? 12 : 8
}

/** The picture for a chat: the other person in a DM, the group's emoji, or two members' faces. */
export function ConversationAvatar({ conversation, size, story = false, showActive = false }: ConversationAvatarProps) {
  const box = story ? size + ringSpace(size) : size
  // The most recent "last active" time of anyone in the chat (live, through account.updated events).
  const lastActiveAt = useStore((s) =>
    Math.max(0, ...conversation.members.map((member) => (s.accounts[member.id] ?? member).lastActiveAt ?? 0)),
  )
  const active = lastActiveAt > 0 && isActiveNow(lastActiveAt)
  const [first, second] = conversation.members

  let picture
  if (conversation.kind === 'dm' && first) {
    picture = <Avatar account={first} size={size} story={story} />
  } else if (conversation.emoji) {
    picture = (
      <span
        aria-hidden
        className="grid place-items-center rounded-full bg-surface-2 leading-none"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.48) }}
      >
        {conversation.emoji}
      </span>
    )
  } else if (first && second) {
    picture = <AvatarPair first={first} second={second} size={size} />
  } else {
    picture = <Avatar account={first ?? null} size={size} />
  }

  const dot = Math.max(10, Math.round(size * 0.24))
  const inset = (box - size) / 2 + size * 0.02
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: box, height: box }}>
      {picture}
      {showActive && active && (
        <span
          aria-label="Active now"
          className="pointer-events-none absolute rounded-full bg-success ring-[3px] ring-bg"
          style={{ width: dot, height: dot, right: inset, bottom: inset }}
        />
      )}
    </span>
  )
}
