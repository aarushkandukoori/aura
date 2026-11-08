import { Eye, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AvatarStack, ConfirmDialog, toast } from '../../components'
import { api } from '../../lib/api'
import { formatCount } from '../../lib/format'
import { useStore } from '../../lib/store'
import type { Story } from '../../lib/types'
import { useStoryViewers } from './hooks'
import { ViewersSheet } from './ViewersSheet'

interface MyStoryFooterProps {
  story: Story
  /** true while the viewers sheet or the delete dialog is open: the story waits. */
  onBusyChange: (busy: boolean) => void
  onDeleted: () => void
}

/** Under my own story: "Seen by N" with the latest viewers' faces (opens the viewers sheet) and delete. */
export function MyStoryFooter({ story, onBusyChange, onDeleted }: MyStoryFooterProps) {
  const viewers = useStoryViewers(story.id)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const total = viewers?.total ?? story.viewCount

  useEffect(() => {
    onBusyChange(sheetOpen || confirming)
  }, [sheetOpen, confirming, onBusyChange])
  useEffect(() => () => onBusyChange(false), [onBusyChange])

  async function deleteStory() {
    try {
      await api.deleteStory(story.id)
      useStore.getState().removeStoryLocal(story.id)
      toast('Story deleted')
      onDeleted()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't delete the story")
    }
  }

  return (
    <div className="flex items-end justify-between px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-8">
      <button type="button" onClick={() => setSheetOpen(true)} className="flex flex-col items-start gap-1.5 text-left">
        {viewers && viewers.viewers.length > 0 && <AvatarStack accounts={viewers.viewers.map((v) => v.account)} size={26} />}
        <span className="flex items-center gap-1.5 text-sm font-semibold drop-shadow-[0_1px_2px_rgb(0_0_0/0.4)]">
          <Eye size={17} />
          {total > 0 ? `Seen by ${formatCount(total)}` : 'No views yet'}
        </span>
      </button>
      <button type="button" aria-label="Delete story" onClick={() => setConfirming(true)} className="grid size-11 place-items-center rounded-full transition hover:bg-white/10">
        <Trash size={22} />
      </button>

      <ViewersSheet open={sheetOpen} onClose={() => setSheetOpen(false)} viewers={viewers} />
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={deleteStory}
        title="Delete this story?"
        message="It will disappear for everyone right away."
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}
