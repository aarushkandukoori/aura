import { ImagePlus, Type, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import { useCloseOverlay } from '../../app/navigation'
import { Avatar, ConfirmDialog, Spinner, toast } from '../../components'
import { api } from '../../lib/api'
import { useEscapeKey } from '../../lib/hooks'
import { useMe, useStore } from '../../lib/store'
import type { StoryOverlay } from '../../lib/types'
import { uploadMedia } from '../../lib/upload'
import { isWide, StoryPicture } from './StoryMedia'
import { StoryOverlayText } from './StoryOverlayText'
import { STORY_CARD, StoryStage } from './StoryStage'
import { StoryTextEditor } from './StoryTextEditor'
import { capturePointer } from './useStoryGestures'

interface PickedPhoto {
  file: File
  /** A local blob: URL for the preview. */
  url: string
  width: number
  height: number
}

const NEW_TEXT: StoryOverlay = { text: '', color: '#FFFFFF', background: null, y: 0.5 }

/**
 * /create/story - pick a photo, add text (color, pill, drag it up or down), share.
 * The text is saved as data next to the photo (not burned in), so the viewer draws it crisply.
 */
export function StoryComposerPage() {
  const me = useMe()
  const close = useCloseOverlay('/')
  const fileInput = useRef<HTMLInputElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; moved: boolean } | null>(null)
  const [photo, setPhoto] = useState<PickedPhoto | null>(null)
  const [overlay, setOverlay] = useState<StoryOverlay>(NEW_TEXT)
  const [editing, setEditing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // Free the preview's memory when the photo changes or the composer closes.
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url)
  }, [photo])

  function requestClose() {
    if (sharing) return // the upload finishes and closes the composer by itself
    if (photo) setConfirmDiscard(true)
    else close()
  }
  useEscapeKey(requestClose, !editing)

  async function pick(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('Pick a photo for your story')
      return
    }
    const url = URL.createObjectURL(file)
    try {
      setPhoto({ file, url, ...(await imageSize(url)) })
    } catch {
      URL.revokeObjectURL(url)
      toast("Couldn't open that photo. Try a JPG or PNG.")
    }
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    pick(event.target.files?.[0])
    event.target.value = '' // picking the same file again still fires a change
  }

  async function share() {
    if (!photo || sharing) return
    setSharing(true)
    try {
      const media = await uploadMedia(photo.file)
      const text = overlay.text?.trim()
      const story = await api.createStory({ media, overlay: text ? { ...overlay, text } : null })
      useStore.getState().addStory(story)
      toast('Added to your story', { icon: '✨' })
      close()
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't share your story")
      setSharing(false)
    }
  }

  // Drag the text up or down; a tap without moving opens it for editing.
  const textDrag = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      capturePointer(event)
      drag.current = { startY: event.clientY, moved: false }
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const state = drag.current
      if (!state || !card.current) return
      if (Math.abs(event.clientY - state.startY) > 4) state.moved = true
      if (!state.moved) return
      const box = card.current.getBoundingClientRect()
      const y = Math.min(0.9, Math.max(0.1, (event.clientY - box.top) / box.height))
      setOverlay((current) => ({ ...current, y }))
    },
    onPointerUp() {
      const wasDragged = drag.current?.moved
      drag.current = null
      if (!wasDragged) setEditing(true)
    },
    onPointerCancel() {
      drag.current = null
    },
  }

  return (
    <StoryStage onClose={requestClose}>
      <div
        ref={card}
        className={STORY_CARD}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          pick(event.dataTransfer.files[0])
        }}
      >
        {photo ? (
          <>
            <StoryPicture src={photo.url} wide={isWide(photo)} alt="Your story photo" />
            {!editing && <StoryOverlayText overlay={overlay} drag={textDrag} />}
            {editing && <StoryTextEditor overlay={overlay} onChange={setOverlay} onDone={() => setEditing(false)} />}
          </>
        ) : (
          <EmptyComposer onPick={() => fileInput.current?.click()} />
        )}

        {!editing && (
          <div className="absolute inset-x-0 top-0 flex items-center justify-between px-2 pt-[max(env(safe-area-inset-top),10px)]">
            <button type="button" aria-label="Close" onClick={requestClose} className="grid size-11 place-items-center rounded-full drop-shadow transition hover:bg-white/10">
              <X size={28} />
            </button>
            {photo && (
              <button type="button" aria-label="Add text" onClick={() => setEditing(true)} className="grid size-11 place-items-center rounded-full drop-shadow transition hover:bg-white/10">
                <Type size={26} />
              </button>
            )}
          </div>
        )}

        {photo && !editing && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-linear-to-t from-black/50 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-10">
            <button
              type="button"
              aria-label="Choose another photo"
              onClick={() => fileInput.current?.click()}
              disabled={sharing}
              className="grid size-11 place-items-center rounded-full bg-black/40 transition hover:bg-black/60"
            >
              <ImagePlus size={22} />
            </button>
            <button
              type="button"
              onClick={share}
              disabled={sharing}
              className="flex h-11 items-center gap-2 rounded-full bg-white pl-1.5 pr-5 text-sm font-semibold text-black transition active:scale-[0.98] disabled:opacity-80"
            >
              {sharing ? <Spinner size={18} className="mx-1.5" /> : <Avatar account={me} size={32} />}
              {sharing ? 'Sharing…' : 'Your story'}
            </button>
          </div>
        )}

        <input ref={fileInput} type="file" accept="image/*" onChange={onFileChosen} className="hidden" />
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={close}
        title="Discard this story?"
        message="If you leave now, your photo and text won't be saved."
        confirmLabel="Discard"
        danger
      />
    </StoryStage>
  )
}

/** Before a photo is picked: a friendly prompt with a button (desktop can also drop a file on it). */
function EmptyComposer({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-linear-to-br from-aura-1/35 via-black to-aura-5/30 px-8 text-center">
      <div className="mb-2 grid size-20 place-items-center rounded-full border-2 border-white/80">
        <ImagePlus size={34} strokeWidth={1.5} />
      </div>
      <h1 className="text-xl font-bold">Add to your story</h1>
      <p className="max-w-[260px] text-sm text-white/75">Share a moment. It stays up for 24 hours.</p>
      <button type="button" onClick={onPick} className="mt-3 h-11 rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-white/90">
        Choose a photo
      </button>
    </div>
  )
}

/** The pixel size of a picture (also proves the browser can open it). */
function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('unreadable image'))
    image.src = url
  })
}
