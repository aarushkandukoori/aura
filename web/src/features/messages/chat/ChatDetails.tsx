import { BellOff, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button, buttonClasses, ConfirmDialog, Switch, TextField, toast, UserRow, VerifiedBadge } from '../../../components'
import { api } from '../../../lib/api'
import { cx } from '../../../lib/cx'
import { useAccount, useMe, useStore } from '../../../lib/store'
import type { Account, Conversation, UpdateConversationRequest } from '../../../lib/types'
import { ConversationAvatar } from '../ConversationAvatar'
import { GROUP_EMOJI } from '../emoji'

interface ChatDetailsProps {
  conversation: Conversation
  /** After "Delete chat" (go back to the inbox). */
  onDeleted: () => void
}

/**
 * The info panel of a chat. Groups: rename, pick an emoji, members (linking to profiles).
 * Everyone: mute, delete.
 */
export function ChatDetails({ conversation, onDeleted }: ChatDetailsProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const isGroup = conversation.kind === 'group'

  async function save(changes: UpdateConversationRequest, done?: string) {
    try {
      useStore.getState().upsertConversation(await api.updateConversation(conversation.id, changes))
      if (done) toast(done)
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Couldn't save that change")
    }
  }

  async function remove() {
    try {
      await api.deleteConversation(conversation.id)
      useStore.getState().removeConversation(conversation.id)
      toast('Chat deleted')
      onDeleted()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Couldn't delete the chat")
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-xl pb-10">
        {isGroup && <GroupHeader conversation={conversation} onSave={save} />}
        {!isGroup && conversation.members[0] && <PersonHeader conversation={conversation} member={conversation.members[0]} />}

        <Section>
          <div className="flex items-center gap-3 px-4 py-3">
            <BellOff size={22} strokeWidth={1.75} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Mute messages</div>
              <div className="text-[13px] text-muted">No banners from this chat. Messages still arrive.</div>
            </div>
            <Switch label="Mute messages" checked={conversation.muted} onChange={(muted) => save({ muted }, muted ? 'Chat muted' : 'Chat unmuted')} />
          </div>
        </Section>

        {isGroup && <Members conversation={conversation} />}

        <Section>
          <button type="button" onClick={() => setConfirmingDelete(true)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-danger hover:bg-surface">
            <Trash2 size={22} strokeWidth={1.75} aria-hidden />
            <span className="text-sm font-semibold">Delete chat</span>
          </button>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={remove}
        media={<ConversationAvatar conversation={conversation} size={72} />}
        title="Delete this chat?"
        message="The chat and all its messages will be removed from your inbox."
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-2">
      {title && <h3 className="px-4 pb-1 pt-2 text-[15px] font-semibold">{title}</h3>}
      {children}
    </section>
  )
}

/** A DM's details: who it is, with a link to their profile. */
function PersonHeader({ conversation, member: person }: { conversation: Conversation; member: Account }) {
  const member = useAccount(person)
  return (
    <div className="flex flex-col items-center px-4 pb-6 pt-8 text-center">
      <ConversationAvatar conversation={conversation} size={96} story />
      <h2 className="mt-3 flex items-center gap-1 text-lg font-bold">
        {member.displayName}
        {member.verified && <VerifiedBadge size={16} />}
      </h2>
      <p className="text-sm text-muted">{member.username}</p>
      <Link to={`/${member.username}`} className={cx(buttonClasses({ variant: 'secondary', size: 'sm' }), 'mt-4')}>
        View profile
      </Link>
    </div>
  )
}

/** A group's details: its picture, a rename box and the emoji choices. */
function GroupHeader({ conversation, onSave }: { conversation: Conversation; onSave: (changes: UpdateConversationRequest, done?: string) => Promise<void> }) {
  const [name, setName] = useState(conversation.title)
  const [saving, setSaving] = useState(false)
  const changed = name.trim() !== conversation.title

  async function rename() {
    setSaving(true)
    // An empty name goes back to the members' first names.
    await onSave({ title: name.trim() }, 'Group renamed')
    setSaving(false)
  }

  return (
    <div className="px-4 pb-5 pt-8">
      <div className="flex flex-col items-center text-center">
        <ConversationAvatar conversation={conversation} size={96} />
        <h2 className="mt-3 text-lg font-bold">{conversation.title}</h2>
        <p className="text-sm text-muted">{conversation.members.length + 1} members</p>
      </div>

      <form
        className="mt-6 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (changed) rename()
        }}
      >
        <TextField label="Group name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder="Name this group" />
        <Button type="submit" disabled={!changed} loading={saving} className="mb-[22px] h-11">
          Save
        </Button>
      </form>

      <div className="mt-4">
        <p className="mb-2 text-[13px] font-semibold">Group emoji</p>
        <div className="flex flex-wrap gap-1.5">
          <EmojiChoice selected={conversation.emoji === null} label="No emoji (show members)" onClick={() => onSave({ emoji: null })}>
            <span className="text-xs font-semibold text-muted">None</span>
          </EmojiChoice>
          {GROUP_EMOJI.map((emoji) => (
            <EmojiChoice key={emoji} selected={conversation.emoji === emoji} label={`Use ${emoji}`} onClick={() => onSave({ emoji })}>
              <span className="text-[20px] leading-none">{emoji}</span>
            </EmojiChoice>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmojiChoice({ selected, label, onClick, children }: { selected: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'grid h-10 min-w-10 place-items-center rounded-full px-2 transition',
        selected ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}

/** Everyone in the group, me last, each linking to their profile. */
function Members({ conversation }: { conversation: Conversation }) {
  const me = useMe()
  return (
    <Section title="Members">
      {conversation.members.map((member) => (
        <UserRow key={member.id} account={member} follow />
      ))}
      <UserRow account={me} subtitle="You" story={false} />
    </Section>
  )
}
