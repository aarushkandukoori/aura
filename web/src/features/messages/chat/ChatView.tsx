import { MessageCircleOff } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useGoBack } from '../../../app/navigation'
import { buttonClasses, EmptyState, Spinner } from '../../../components'
import { cx } from '../../../lib/cx'
import { useEscapeKey } from '../../../lib/hooks'
import type { Conversation, ID, Message } from '../../../lib/types'
import { ChatDetails } from './ChatDetails'
import { ChatHeader } from './ChatHeader'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { RequestBar } from './RequestBar'
import { useChat, type ChatState } from './useChat'
import { useVisibleHeight } from './useVisibleHeight'

interface ChatViewProps {
  conversationId: ID
  /** Phones: the chat covers the whole screen and has a back arrow. */
  fullScreen: boolean
}

/** One open chat: header, messages (or the details panel), request bar and composer. */
export function ChatView({ conversationId, fullScreen }: ChatViewProps) {
  const chat = useChat(conversationId)
  const root = useRef<HTMLDivElement>(null)
  useVisibleHeight(root, fullScreen)

  return (
    <div ref={root} className={cx('flex flex-col bg-bg', fullScreen ? 'fixed inset-x-0 top-0 z-20 h-dvh' : 'h-full')}>
      {chat.notFound ? (
        <div className="m-auto">
          <EmptyState
            icon={<MessageCircleOff size={30} strokeWidth={1.5} />}
            title="This chat isn't available"
            body="It may have been deleted."
            action={<Link to="/messages" className={buttonClasses({ variant: 'secondary' })}>Back to messages</Link>}
          />
        </div>
      ) : chat.conversation ? (
        <OpenChat conversation={chat.conversation} chat={chat} fullScreen={fullScreen} />
      ) : (
        <div className="m-auto text-muted">
          <Spinner size={26} />
        </div>
      )}
    </div>
  )
}

function OpenChat({ conversation, chat, fullScreen }: { conversation: Conversation; chat: ChatState; fullScreen: boolean }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const navigate = useNavigate()
  const goBack = useGoBack('/messages')
  useEscapeKey(() => setDetailsOpen(false), detailsOpen)
  const toInbox = () => navigate('/messages', { replace: true })

  return (
    <>
      <ChatHeader
        conversation={conversation}
        // On phones the arrow first closes the details panel, then goes back to the inbox.
        onBack={fullScreen ? () => (detailsOpen ? setDetailsOpen(false) : goBack()) : null}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((open) => !open)}
      />
      {detailsOpen ? (
        <ChatDetails conversation={conversation} onDeleted={toInbox} />
      ) : (
        <>
          <MessageList
            conversation={conversation}
            messages={chat.messages}
            hasOlder={chat.hasOlder}
            loadingOlder={chat.loadingOlder}
            onLoadOlder={chat.loadOlder}
            onReply={setReplyTo}
            error={chat.error}
            onRetry={chat.retry}
          />
          {conversation.isRequest && <RequestBar conversation={conversation} onDeleted={toInbox} />}
          <Composer
            conversationId={conversation.id}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            disabled={chat.messages === undefined}
          />
        </>
      )}
    </>
  )
}
