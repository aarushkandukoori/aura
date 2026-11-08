import { Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { buttonClasses } from '../../components'
import { useIsMobile } from '../../lib/hooks'
import { useStore } from '../../lib/store'
import { ChatView } from './chat/ChatView'
import { useLoadInbox } from './data'
import { Inbox, type InboxTab } from './inbox/Inbox'
import { NewMessage } from './NewMessage'

/**
 * /messages, /messages/new and /messages/:id.
 * Desktop: the inbox on the left and the open chat on the right (new message is a dialog on top).
 * Phones: one screen at a time - the inbox, a full-screen chat, or the new-message screen.
 *
 * The three routes share this one component, so the inbox keeps its tab, search and scroll position
 * while you switch between chats.
 */
export function MessagesPage() {
  const { id } = useParams()
  const { pathname } = useLocation()
  const isMobile = useIsMobile()
  const isNew = pathname === '/messages/new'
  const openId = isNew ? null : id ?? null
  const inbox = useLoadInbox()
  const [tab, setTab] = useState<InboxTab>('primary')
  const [query, setQuery] = useState('')

  // The tab follows the open chat: a request shows Requests beside it, and once it is accepted
  // (or a normal chat opens from a banner) the inbox switches back to Primary.
  const openIsRequest = useStore((s) => (openId ? s.conversations[openId]?.isRequest : undefined))
  useEffect(() => {
    if (openIsRequest !== undefined) setTab(openIsRequest ? 'requests' : 'primary')
  }, [openId, openIsRequest])

  const inboxProps = {
    activeId: openId,
    tab,
    onTabChange: setTab,
    query,
    onQueryChange: setQuery,
    status: inbox.status,
    onRetry: inbox.retry,
  }

  if (isMobile) {
    if (isNew) return <NewMessage fullScreen />
    if (openId) return <ChatView key={openId} conversationId={openId} fullScreen />
    return <Inbox {...inboxProps} className="h-[calc(100dvh-var(--tabbar-h))]" />
  }

  return (
    <div className="flex h-dvh">
      <Inbox {...inboxProps} className="w-[320px] shrink-0 border-r border-line lg:w-[360px] xl:w-[397px]" />
      <div className="min-w-0 flex-1">
        {openId ? <ChatView key={openId} conversationId={openId} fullScreen={false} /> : <NoChatOpen />}
      </div>
      {isNew && <NewMessage fullScreen={false} />}
    </div>
  )
}

/** Desktop, nothing open yet. */
function NoChatOpen() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="grid size-24 place-items-center rounded-full border-2 border-fg">
        <Send size={42} strokeWidth={1.25} className="-translate-x-0.5 translate-y-0.5" />
      </div>
      <h2 className="mt-5 text-xl font-semibold">Your messages</h2>
      <p className="mt-1.5 max-w-xs text-sm text-muted">Pick a chat, or start a new one. Everyone's happy to hear from you.</p>
      <Link to="/messages/new" className={`${buttonClasses()} mt-5`}>
        Send message
      </Link>
    </div>
  )
}
