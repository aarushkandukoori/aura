import { Link } from 'react-router'
import { buttonClasses, VerifiedBadge } from '../../../components'
import { cx } from '../../../lib/cx'
import { useAccount } from '../../../lib/store'
import type { Account, Conversation } from '../../../lib/types'
import { ConversationAvatar } from '../ConversationAvatar'
import { memberNames } from '../preview'

/** The top of a chat (shown once the very first message is loaded): who this chat is with. */
export function ChatIntro({ conversation }: { conversation: Conversation }) {
  const member = conversation.members[0]
  if (conversation.kind === 'dm' && member) return <DmIntro conversation={conversation} member={member} />
  return (
    <div className="flex flex-col items-center px-4 pb-8 pt-8 text-center">
      <ConversationAvatar conversation={conversation} size={88} />
      <h2 className="mt-3 text-lg font-bold">{conversation.title}</h2>
      <p className="mt-0.5 max-w-xs text-sm text-muted">{memberNames(conversation)}</p>
    </div>
  )
}

function DmIntro({ conversation, member }: { conversation: Conversation; member: Account }) {
  const live = useAccount(member)
  const relation = live.followsMe && live.iFollow ? 'You follow each other on Aura' : live.followsMe ? 'Follows you' : live.iFollow ? 'You follow them' : ''
  return (
    <div className="flex flex-col items-center px-4 pb-8 pt-8 text-center">
      <ConversationAvatar conversation={conversation} size={88} story />
      <h2 className="mt-3 flex items-center gap-1 text-lg font-bold">
        {live.displayName}
        {live.verified && <VerifiedBadge size={16} />}
      </h2>
      <p className="text-sm text-muted">{live.username}</p>
      {relation && <p className="mt-0.5 text-sm text-muted">{relation}</p>}
      <Link to={`/${live.username}`} className={cx(buttonClasses({ variant: 'secondary', size: 'sm' }), 'mt-4')}>
        View profile
      </Link>
    </div>
  )
}
