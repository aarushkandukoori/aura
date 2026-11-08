import { X } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { useGoBack } from '../../app/navigation'
import { Avatar, Button, IconButton, Modal, Spinner, toast, VerifiedBadge } from '../../components'
import { api } from '../../lib/api'
import { useInbox, useMe, useStore } from '../../lib/store'
import type { Account } from '../../lib/types'
import { uniqueAccounts, useAccountSearch, useFollowing } from './data'
import { PickMark } from './PickMark'

/**
 * Start a chat: pick one person for a DM (opens the existing one if there is one) or several for a
 * group with an optional name. A modal on desktop, a full screen on phones.
 */
export function NewMessage({ fullScreen }: { fullScreen: boolean }) {
  const close = useGoBack('/messages')
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-20 flex flex-col bg-bg pt-safe">
        <NewMessageForm fullScreen onClose={close} />
      </div>
    )
  }
  return (
    <Modal open onClose={close} title="New message" size="md">
      <div className="flex h-[min(600px,75dvh)] flex-col">
        <NewMessageForm fullScreen={false} onClose={close} />
      </div>
    </Modal>
  )
}

function NewMessageForm({ fullScreen, onClose }: { fullScreen: boolean; onClose: () => void }) {
  const me = useMe()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Account[]>([])
  const [groupName, setGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const searchBox = useRef<HTMLInputElement>(null)
  const { results, searching } = useAccountSearch(query)
  const suggested = useSuggestedPeople(me.username)
  const people = query.trim() ? results : suggested.people
  const isGroup = selected.length > 1

  function toggle(account: Account) {
    setSelected((current) =>
      current.some((person) => person.id === account.id) ? current.filter((person) => person.id !== account.id) : [...current, account],
    )
    // Picked someone from a search: clear it and get ready for the next name.
    if (query) {
      setQuery('')
      searchBox.current?.focus()
    }
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Backspace in an empty search box takes back the last person picked.
    if (event.key === 'Backspace' && query === '' && selected.length > 0) setSelected((current) => current.slice(0, -1))
  }

  async function start() {
    if (selected.length === 0 || creating) return
    setCreating(true)
    try {
      const conversation = await api.createConversation({
        memberIds: selected.map((person) => person.id),
        title: isGroup ? groupName.trim() || null : null,
      })
      useStore.getState().upsertConversation(conversation)
      // Replace this screen, so Back from the new chat returns to the inbox.
      navigate(`/messages/${conversation.id}`, { replace: true })
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Couldn't start that chat")
      setCreating(false)
    }
  }

  return (
    <>
      {fullScreen && (
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-1">
          <IconButton label="Close" onClick={onClose}>
            <X size={26} strokeWidth={1.75} />
          </IconButton>
          <h1 className="flex-1 text-center text-base font-semibold">New message</h1>
          <button
            type="button"
            onClick={start}
            disabled={selected.length === 0 || creating}
            className="h-10 w-14 text-[15px] font-semibold text-accent disabled:text-muted disabled:opacity-60"
          >
            {creating ? <Spinner size={18} className="mx-auto" /> : 'Chat'}
          </button>
        </header>
      )}

      <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-2.5">
        <span className="pt-[7px] text-[15px] font-semibold">To:</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {selected.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => toggle(person)}
              aria-label={`Remove ${person.username}`}
              className="flex h-8 items-center gap-1 rounded-full bg-accent-soft pl-3 pr-2 text-[13px] font-semibold text-accent"
            >
              {person.username}
              <X size={14} strokeWidth={2.5} />
            </button>
          ))}
          <input
            ref={searchBox}
            autoFocus={!fullScreen}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={selected.length === 0 ? 'Search people' : 'Add more'}
            aria-label="Search people"
            className="h-8 min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </div>
      </div>

      {isGroup && (
        <div className="shrink-0 border-b border-line px-4 py-2.5">
          <input
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            maxLength={60}
            placeholder="Group name (optional)"
            aria-label="Group name"
            className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
        <h2 className="px-4 pb-1 pt-1 text-[15px] font-semibold">{query.trim() ? 'People' : 'Suggested'}</h2>
        {people.map((person) => (
          <PersonRow key={person.id} account={person} selected={selected.some((picked) => picked.id === person.id)} onToggle={() => toggle(person)} />
        ))}
        {people.length === 0 && (
          <div className="flex justify-center px-4 py-8 text-center text-sm text-muted">
            {query.trim() ? (searching ? <Spinner size={20} /> : 'No one found.') : suggested.loading ? <Spinner size={20} /> : 'Search for someone to message.'}
          </div>
        )}
      </div>

      {!fullScreen && (
        <div className="shrink-0 border-t border-line p-4">
          <Button block size="lg" disabled={selected.length === 0} loading={creating} onClick={start}>
            {isGroup ? 'Start group chat' : 'Chat'}
          </Button>
        </div>
      )}
    </>
  )
}

/** People to suggest before typing: whoever I've been chatting with lately, then everyone I follow. */
function useSuggestedPeople(myUsername: string): { people: Account[]; loading: boolean } {
  const inbox = useInbox()
  const following = useFollowing(myUsername)
  const people = useMemo(() => {
    const recent = inbox.flatMap((conversation) => (conversation.kind === 'dm' ? conversation.members : []))
    return uniqueAccounts([...recent, ...(following ?? [])])
  }, [inbox, following])
  return { people, loading: following === null }
}

function PersonRow({ account, selected, onToggle }: { account: Account; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface"
    >
      <Avatar account={account} size={44} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-sm font-semibold">{account.displayName}</span>
          {account.verified && <VerifiedBadge size={13} />}
        </span>
        <span className="block truncate text-sm text-muted">{account.username}</span>
      </span>
      <PickMark checked={selected} />
    </button>
  )
}
