import { useState } from 'react'
import { Button, ConfirmDialog, toast } from '../../../components'
import { api } from '../../../lib/api'
import { firstName } from '../../../lib/format'
import { useStore } from '../../../lib/store'
import type { Conversation } from '../../../lib/types'

/**
 * Shown above the composer for a message request: accept it into the inbox, or delete it.
 * (Just replying accepts it too; the server does that.)
 */
export function RequestBar({ conversation, onDeleted }: { conversation: Conversation; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const name = conversation.kind === 'dm' ? firstName(conversation.title) : conversation.title

  async function accept() {
    setBusy(true)
    try {
      useStore.getState().upsertConversation(await api.acceptConversation(conversation.id))
      toast('Moved to your inbox')
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Couldn't accept the request")
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    try {
      await api.deleteConversation(conversation.id)
      useStore.getState().removeConversation(conversation.id)
      onDeleted()
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Couldn't delete the request")
    }
  }

  return (
    <div className="shrink-0 border-t border-line px-4 pb-1 pt-3 text-center">
      <p className="text-sm font-semibold">{name} wants to send you a message</p>
      <p className="mx-auto mt-0.5 max-w-sm text-[13px] text-muted">Accept to move this chat to your inbox. Replying accepts it too.</p>
      <div className="mx-auto mt-3 flex max-w-sm gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-9 flex-1 rounded-lg bg-surface-2 text-sm font-semibold text-danger transition-colors hover:bg-line"
        >
          Delete
        </button>
        <Button loading={busy} onClick={accept} className="flex-1">
          Accept
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
        title="Delete this request?"
        message="The chat and its messages will be removed."
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
