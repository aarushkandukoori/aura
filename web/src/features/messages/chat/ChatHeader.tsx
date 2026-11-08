import { ChevronLeft, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { IconButton, VerifiedBadge } from '../../../components'
import { cx } from '../../../lib/cx'
import { activeLabel } from '../../../lib/format'
import { useAccount, useTyping } from '../../../lib/store'
import type { Account, Conversation } from '../../../lib/types'
import { ConversationAvatar } from '../ConversationAvatar'
import { useNow } from '../data'
import { typingLabel } from '../preview'

interface ChatHeaderProps {
  conversation: Conversation
  /** Phones: the back arrow (to the inbox, or out of the details panel). */
  onBack: (() => void) | null
  detailsOpen: boolean
  onToggleDetails: () => void
}

/** The top of a chat: picture, name, "Active now" / "typing..." / member count, and the info button. */
export function ChatHeader({ conversation, onBack, detailsOpen, onToggleDetails }: ChatHeaderProps) {
  const typing = useTyping(conversation.id)
  const now = useNow(30_000) // keeps "Active 12m ago" and the green dot current
  const member = conversation.members[0]
  const isDm = conversation.kind === 'dm' && member !== undefined

  return (
    <header className="shrink-0 border-b border-line bg-bg pt-safe">
      <div className="flex h-[60px] items-center gap-1 pl-1 pr-2 md:h-[75px] md:gap-3 md:px-4">
        {onBack && (
          <IconButton label="Back" onClick={onBack}>
            <ChevronLeft size={28} strokeWidth={1.75} />
          </IconButton>
        )}

        {isDm ? (
          <Link to={`/${member.username}`} className="flex min-w-0 items-center gap-3 rounded-lg pr-2 hover:opacity-80">
            <ConversationAvatar conversation={conversation} size={40} showActive />
            <Titles title={conversation.title} verified={member.verified} subtitle={<DmStatus member={member} typing={typing.length > 0} now={now} />} />
          </Link>
        ) : (
          <button type="button" onClick={onToggleDetails} className="flex min-w-0 items-center gap-3 rounded-lg pr-2 text-left hover:opacity-80">
            <ConversationAvatar conversation={conversation} size={40} showActive />
            <Titles
              title={conversation.title}
              subtitle={typing.length > 0 ? <span className="text-accent">{typingLabel(conversation, typing)}</span> : `${conversation.members.length + 1} members`}
            />
          </button>
        )}

        <IconButton
          label={detailsOpen ? 'Close details' : 'Chat details'}
          aria-pressed={detailsOpen}
          onClick={onToggleDetails}
          className="ml-auto"
        >
          {/* Filled when the panel is open: a dark disc with the "i" cut out in the page color. */}
          <Info size={26} strokeWidth={1.75} fill={detailsOpen ? 'var(--fg)' : 'none'} color={detailsOpen ? 'var(--bg)' : 'currentColor'} className={cx(detailsOpen && 'scale-110')} />
        </IconButton>
      </div>
    </header>
  )
}

function Titles({ title, verified = false, subtitle }: { title: string; verified?: boolean; subtitle: ReactNode }) {
  return (
    <span className="min-w-0">
      <span className="flex items-center gap-1">
        <span className="truncate text-[15px] font-semibold leading-tight">{title}</span>
        {verified && <VerifiedBadge size={13} />}
      </span>
      <span className="block truncate text-xs leading-snug text-muted">{subtitle}</span>
    </span>
  )
}

/** "typing..." while they type, else "Active now" / "Active 12m ago", else their username. */
function DmStatus({ member, typing, now }: { member: Account; typing: boolean; now: number }) {
  const live = useAccount(member)
  if (typing) return <span className="text-accent">typing...</span>
  return <>{activeLabel(live.lastActiveAt, now) || live.username}</>
}
