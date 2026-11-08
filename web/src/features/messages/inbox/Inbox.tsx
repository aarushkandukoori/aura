import { ChevronLeft, Inbox as InboxIcon, Search, Send, SquarePen, X } from 'lucide-react'
import { Link } from 'react-router'
import { useGoBack } from '../../../app/navigation'
import { Button, buttonClasses, EmptyState, IconButton, Skeleton, Tabs } from '../../../components'
import { cx } from '../../../lib/cx'
import { useIsMobile } from '../../../lib/hooks'
import { useInbox, useMe, useRequests } from '../../../lib/store'
import { useNow, type LoadStatus } from '../data'
import { matchesQuery } from '../preview'
import { ConversationRow } from './ConversationRow'

export type InboxTab = 'primary' | 'requests'

interface InboxProps {
  /** The chat open next to the inbox (desktop), to highlight its row. */
  activeId: string | null
  tab: InboxTab
  onTabChange: (tab: InboxTab) => void
  query: string
  onQueryChange: (query: string) => void
  status: LoadStatus
  onRetry: () => void
  className?: string
}

/** The chat list: my username, a new-message button, search, Primary / Requests tabs and the rows. */
export function Inbox({ activeId, tab, onTabChange, query, onQueryChange, status, onRetry, className }: InboxProps) {
  const me = useMe()
  const primary = useInbox()
  const requests = useRequests()
  const now = useNow(30_000)
  const isMobile = useIsMobile()
  const goBack = useGoBack('/')

  const all = tab === 'primary' ? primary : requests
  const shown = all.filter((conversation) => matchesQuery(conversation, query))

  return (
    <section aria-label="Messages" className={cx('flex min-h-0 flex-col bg-bg', className)}>
      <header className="shrink-0 pt-safe">
        <div className="flex h-14 items-center gap-1 px-2 md:h-[75px] md:px-6 md:pt-2">
          {isMobile && (
            <IconButton label="Back" onClick={goBack}>
              <ChevronLeft size={28} strokeWidth={1.75} />
            </IconButton>
          )}
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{me.username}</h1>
          <Link
            to="/messages/new"
            aria-label="New message"
            title="New message"
            className="grid size-10 shrink-0 place-items-center rounded-full transition hover:opacity-60"
          >
            <SquarePen size={24} strokeWidth={1.75} />
          </Link>
        </div>
      </header>

      <div className="shrink-0 px-4 pb-3 md:px-6">
        <SearchBox value={query} onChange={onQueryChange} />
      </div>

      <Tabs
        className="shrink-0"
        value={tab}
        onChange={(value) => onTabChange(value as InboxTab)}
        items={[
          { value: 'primary', label: 'Primary' },
          { value: 'requests', label: 'Requests', badge: requests.length },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5">
        {tab === 'requests' && requests.length > 0 && (
          <p className="px-4 pb-2 pt-1.5 text-[13px] text-muted md:px-6">
            Messages from people you don't follow. Open one to see who it is, then accept or delete it.
          </p>
        )}

        {shown.map((conversation) => (
          <ConversationRow key={conversation.id} conversation={conversation} active={conversation.id === activeId} now={now} />
        ))}

        {/* Also under a chat that was opened from a link before the rest of the inbox arrived. */}
        {status === 'loading' && !query.trim() && <InboxSkeleton />}
        {shown.length === 0 && status === 'error' && (
          <EmptyState
            title="Couldn't load your chats"
            body="Check that Aura is running, then try again."
            action={<Button onClick={onRetry}>Try again</Button>}
          />
        )}
        {shown.length === 0 && status === 'ready' && (
          query.trim() ? (
            <p className="px-6 py-10 text-center text-sm text-muted">No chats match "{query.trim()}"</p>
          ) : tab === 'primary' ? (
            <EmptyState
              icon={<Send size={30} strokeWidth={1.5} />}
              title="Your messages"
              body="Send a message to a friend or a group. Everyone's happy to hear from you."
              action={<Link to="/messages/new" className={buttonClasses()}>Send message</Link>}
            />
          ) : (
            <EmptyState
              icon={<InboxIcon size={30} strokeWidth={1.5} />}
              title="No message requests"
              body="When someone you don't follow messages you, it shows up here first."
            />
          )
        )}
      </div>
    </section>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-3 text-muted focus-within:ring-2 focus-within:ring-accent/25">
      <Search size={16} strokeWidth={2} className="shrink-0" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search"
        aria-label="Search chats"
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="grid size-5 place-items-center rounded-full bg-muted/30 text-fg">
          <X size={12} strokeWidth={2.5} />
        </button>
      )}
    </label>
  )
}

/** Gray placeholder rows while the inbox loads for the first time. */
function InboxSkeleton() {
  return (
    <div aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex items-center gap-3 px-4 py-2 md:px-6">
          <Skeleton circle className="m-1 size-14 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  )
}
