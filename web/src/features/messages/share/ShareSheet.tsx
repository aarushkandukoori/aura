import { Link2, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar, Button, Sheet, Spinner, toast } from '../../../components'
import { api } from '../../../lib/api'
import { copyLink } from '../../../lib/clipboard'
import { cx } from '../../../lib/cx'
import { useInbox, useMe, useStore } from '../../../lib/store'
import type { ID, Post } from '../../../lib/types'
import { ConversationAvatar } from '../ConversationAvatar'
import { useAccountSearch, useFollowing, useLoadInbox } from '../data'
import { PickMark } from '../PickMark'
import { matchesQuery } from '../preview'
import { buildShareTargets, type ShareTarget } from './targets'

interface ShareSheetProps {
  post: Post
  open: boolean
  onClose: () => void
}

/**
 * "Send to": pick chats or people (several at once), add an optional message, Send. Used by post
 * cards and reels. A bottom sheet on phones, a dialog on desktop.
 */
export function ShareSheet({ post, open, onClose }: ShareSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Share" size="md">
      {/* Mounted only while open, so every share starts fresh and closed sheets cost nothing. */}
      {open && <ShareBody post={post} onDone={onClose} />}
    </Sheet>
  )
}

function ShareBody({ post, onDone }: { post: Post; onDone: () => void }) {
  const me = useMe()
  const inbox = useInbox()
  const { status } = useLoadInbox()
  const following = useFollowing(me.username)
  const [query, setQuery] = useState('')
  const { results, searching } = useAccountSearch(query)
  const [picked, setPicked] = useState<Map<string, ShareTarget>>(new Map())
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const targets = useMemo(() => {
    const needle = query.trim()
    if (!needle) return buildShareTargets(inbox.slice(0, 15), following ?? [], inbox)
    return buildShareTargets(inbox.filter((conversation) => matchesQuery(conversation, needle)), results, inbox)
  }, [query, inbox, following, results])

  function toggle(target: ShareTarget) {
    setPicked((current) => {
      const next = new Map(current)
      if (next.has(target.key)) next.delete(target.key)
      else next.set(target.key, target)
      return next
    })
  }

  async function send() {
    if (picked.size === 0 || sending) return
    setSending(true)
    try {
      // People without a chat yet get a DM first (or their existing one back).
      const conversationIds: ID[] = []
      for (const target of picked.values()) {
        if (target.kind === 'conversation') {
          conversationIds.push(target.conversation.id)
        } else {
          const conversation = await api.createConversation({ memberIds: [target.account.id] })
          useStore.getState().upsertConversation(conversation)
          conversationIds.push(conversation.id)
        }
      }
      await api.sharePost(post.id, { conversationIds, text: note.trim() || null })
      toast('Sent', { icon: '✨' })
      onDone()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Couldn't send that")
      setSending(false)
    }
  }

  const loading = targets.length === 0 && (status === 'loading' || following === null || searching)

  return (
    <div className="flex min-h-[min(420px,70dvh)] flex-col">
      <div className="sticky top-0 z-10 bg-elevated px-4 pb-2 pt-3">
        <label className="flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-3 text-muted focus-within:ring-2 focus-within:ring-accent/25">
          <Search size={17} className="shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search people and chats"
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
      </div>

      <div className="flex-1 px-2 pb-3">
        {loading ? (
          <div className="flex justify-center py-12 text-muted">
            <Spinner size={24} />
          </div>
        ) : targets.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted">{query.trim() ? 'No one found.' : 'No chats yet.'}</p>
        ) : (
          <div className="grid grid-cols-3 gap-y-1 sm:grid-cols-4">
            {targets.map((target) => (
              <TargetTile key={target.key} target={target} checked={picked.has(target.key)} onToggle={() => toggle(target)} />
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-line bg-elevated px-4 pb-4 pt-3">
        {picked.size > 0 ? (
          <>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={1000}
              placeholder="Write a message..."
              aria-label="Message"
              className="mb-3 h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
            <Button block size="lg" loading={sending} onClick={send}>
              {picked.size > 1 ? `Send separately (${picked.size})` : 'Send'}
            </Button>
          </>
        ) : (
          <button type="button" onClick={() => copyLink(`/p/${post.id}`)} className="flex flex-col items-center gap-1.5 text-xs font-medium">
            <span className="grid size-12 place-items-center rounded-full bg-surface-2">
              <Link2 size={22} strokeWidth={1.75} />
            </span>
            Copy link
          </button>
        )}
      </div>
    </div>
  )
}

function TargetTile({ target, checked, onToggle }: { target: ShareTarget; checked: boolean; onToggle: () => void }) {
  const name = target.kind === 'conversation' ? target.conversation.title : target.account.displayName
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={name}
      onClick={onToggle}
      className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 transition-colors hover:bg-surface"
    >
      {/* flex, not inline: an inline avatar would sit on the text baseline and leave a gap below. */}
      <span className="relative flex">
        <TargetPicture target={target} />
        <PickMark checked={checked} className={cx('absolute bottom-0 right-0 ring-2 ring-elevated', !checked && 'opacity-0')} />
      </span>
      <span className={cx('line-clamp-2 w-full text-center text-xs leading-tight', checked && 'font-semibold')}>{name}</span>
    </button>
  )
}

function TargetPicture({ target }: { target: ShareTarget }) {
  if (target.kind === 'conversation') return <ConversationAvatar conversation={target.conversation} size={64} />
  return <Avatar account={target.account} size={64} />
}

