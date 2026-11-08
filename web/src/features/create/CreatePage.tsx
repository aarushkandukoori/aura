/**
 * Create a new post (SPEC 9, screen 7): pick up to 10 photos or one video -> crop -> filter ->
 * caption, location, tags -> Share. A modal over the current page on desktop, a full page on phones.
 * A video skips crop and filters and becomes a reel.
 */
import { ChevronLeft, X } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { useBackgroundLocation, useCloseOverlay, useGoBack, useInModal, useModalCloseGuard } from '../../app/navigation'
import { ConfirmDialog, IconButton, LogoMark, toast } from '../../components'
import { cx } from '../../lib/cx'
import { useIsMobile } from '../../lib/hooks'
import { useStore } from '../../lib/store'
import type { Account } from '../../lib/types'
import { CropStep } from './CropStep'
import { DetailsStep } from './DetailsStep'
import { readFiles } from './files'
import { FilterStep } from './FilterStep'
import { aspectRatio, type AspectChoice, type EditableImage, type PickedVideo } from './model'
import { SelectStep } from './SelectStep'
import { publishPost } from './share'

type Step = 'select' | 'crop' | 'filter' | 'details'

const TITLES: Record<Step, string> = { select: 'Make a post', crop: 'Crop', filter: 'Edit', details: 'Final touches' }

function revokePreviews(images: EditableImage[], video: PickedVideo | null) {
  for (const image of images) URL.revokeObjectURL(image.url)
  if (video) URL.revokeObjectURL(video.url)
}

export function CreatePage() {
  const navigate = useNavigate()
  const inModal = useInModal()
  const phone = useIsMobile()
  const background = useBackgroundLocation()
  const closeOverlay = useCloseOverlay('/')
  const goBack = useGoBack('/')
  const fileInput = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('select')
  const [images, setImages] = useState<EditableImage[]>([])
  const [video, setVideo] = useState<PickedVideo | null>(null)
  const [active, setActive] = useState(0)
  const [aspect, setAspect] = useState<AspectChoice>('portrait')
  const [caption, setCaption] = useState('')
  const [location, setLocation] = useState('')
  const [tagged, setTagged] = useState<Account[]>([])
  const [dragging, setDragging] = useState(false)
  /** Progress text while sharing; null when not sharing. */
  const [status, setStatus] = useState<string | null>(null)
  /** "Discard post?" is open: 'reset' starts over, 'close' leaves the editor. */
  const [discard, setDiscard] = useState<'reset' | 'close' | null>(null)

  const ratio = aspectRatio(aspect, images[0])
  const hasMedia = images.length > 0 || video !== null
  const close = background ? closeOverlay : goBack

  // Free the in-memory previews when the editor goes away.
  const latest = useRef({ images, video })
  useEffect(() => {
    latest.current = { images, video }
  })
  useEffect(() => () => revokePreviews(latest.current.images, latest.current.video), [])

  // Sharing keeps going if the editor is closed; then we only show the toast.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // In the desktop modal, the backdrop, the X and Escape ask before throwing edits away. While
  // sharing they just close it: the post keeps uploading and a toast says when it's live.
  useModalCloseGuard(() => setDiscard('close'), hasMedia && !status)

  async function addFiles(files: File[]) {
    if (files.length === 0) return
    const result = await readFiles(files, images.length)
    if (result.notice) toast(result.notice)
    if (result.video) {
      setVideo(result.video)
      setStep('details')
    } else if (result.images.length > 0) {
      setImages((current) => [...current, ...result.images])
      setActive(images.length) // jump to the first new photo
      setStep('crop')
    }
  }

  function updateImage(id: string, changes: Partial<EditableImage>) {
    setImages((current) => current.map((image) => (image.id === id ? { ...image, ...changes } : image)))
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(images[index].url)
    const rest = images.filter((_, position) => position !== index)
    setImages(rest)
    setActive(Math.max(0, index < active ? active - 1 : Math.min(active, rest.length - 1)))
    if (rest.length === 0) setStep('select')
  }

  function startOver() {
    revokePreviews(images, video)
    setImages([])
    setVideo(null)
    setActive(0)
    setCaption('')
    setLocation('')
    setTagged([])
    setStep('select')
  }

  function back() {
    if (step === 'crop' || (step === 'details' && video)) setDiscard('reset')
    else if (step === 'filter') setStep('crop')
    else if (step === 'details') setStep('filter')
  }

  function next() {
    if (step === 'crop') setStep('filter')
    else if (step === 'filter') setStep('details')
    else if (step === 'details') share()
  }

  async function share() {
    setStatus('Getting your post ready...')
    try {
      const post = await publishPost({ images, video, ratio, caption, location, tagged }, setStatus)
      const store = useStore.getState()
      store.upsertPosts([post])
      store.noteNewPost(post) // puts it at the top of my feed and profile right away
      toast('Your post is live ✨', { action: { label: 'View', href: `/p/${post.id}` } })
      if (mounted.current) navigate('/', { replace: true })
    } catch (error) {
      if (mounted.current) setStatus(null)
      toast(error instanceof Error ? error.message : "Couldn't share your post. Try again.")
    }
  }

  /** Switch to the story composer in place of this editor (closing it returns to the same page). */
  function openStoryComposer() {
    navigate('/create/story', { replace: true, state: background ? { background } : undefined })
  }

  // Dropping files: always stop the browser from opening the file; only add photos where it makes sense.
  const canDrop = step === 'select' || (step === 'crop' && !video)
  function onDragOver(event: DragEvent) {
    event.preventDefault()
    if (canDrop) setDragging(true)
  }
  function onDragLeave(event: DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
  }
  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (canDrop) addFiles([...event.dataTransfer.files])
  }

  // Desktop: the media area is a square that fits the window; the filter and caption steps add a 340 px panel.
  const panel = step === 'filter' || step === 'details' ? 340 : 0
  const side = phone
    ? undefined
    : inModal
      ? `min(calc(100dvh - 112px), calc(100vw - 64px - ${panel}px), 760px)`
      : `min(calc(100dvh - 180px), calc(100vw - 360px - ${panel}px), 640px)`

  const pick = () => fileInput.current?.click()
  let body
  if (step === 'select') {
    body = (
      <div style={side ? { width: side, height: side } : undefined} className={cx(!side && 'flex flex-1 flex-col')}>
        <SelectStep onPick={pick} onStory={openStoryComposer} dragging={dragging} phone={phone} />
      </div>
    )
  } else if (step === 'crop') {
    body = (
      <CropStep
        images={images}
        active={active}
        onSelect={setActive}
        aspect={aspect}
        onAspect={setAspect}
        ratio={ratio}
        onChange={updateImage}
        onRemove={removeImage}
        onAdd={pick}
        side={side}
      />
    )
  } else if (step === 'filter') {
    body = (
      <FilterStep images={images} active={active} onSelect={setActive} ratio={ratio} onFilter={(id, filter) => updateImage(id, { filter })} side={side} />
    )
  } else {
    body = (
      <DetailsStep
        images={images}
        video={video}
        active={active}
        onSelect={setActive}
        ratio={ratio}
        caption={caption}
        onCaption={setCaption}
        location={location}
        onLocation={setLocation}
        tagged={tagged}
        onTagged={setTagged}
        side={side}
      />
    )
  }

  // The modal has its own X; a phone or a directly loaded page needs one on the first step.
  const leftButton =
    step !== 'select' ? (
      <IconButton label="Back" onClick={back} disabled={Boolean(status)}>
        <ChevronLeft size={28} strokeWidth={1.75} />
      </IconButton>
    ) : !inModal ? (
      <IconButton label="Close" onClick={close}>
        <X size={26} strokeWidth={1.75} />
      </IconButton>
    ) : null

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cx(
        'relative flex flex-col',
        phone ? 'min-h-dvh bg-bg' : !inModal && 'mx-auto my-10 w-fit overflow-hidden rounded-xl border border-line bg-elevated shadow-pop',
      )}
    >
      <header className={cx('shrink-0 border-b border-line', phone && 'sticky top-0 z-30 bg-bg/90 pt-safe backdrop-blur-xl')}>
        <div className="relative flex h-12 items-center justify-center px-16">
          <div className="absolute left-1">{leftButton}</div>
          <h1 className="truncate text-base font-semibold">{TITLES[step]}</h1>
          {step !== 'select' && (
            <button
              type="button"
              onClick={next}
              disabled={Boolean(status)}
              className="absolute right-4 text-[15px] font-semibold text-accent transition-colors hover:text-accent-hover disabled:opacity-50"
            >
              {step === 'details' ? 'Share' : 'Next'}
            </button>
          )}
        </div>
      </header>

      {body}

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(event) => {
          addFiles([...(event.target.files ?? [])])
          event.target.value = '' // picking the same file again should still work
        }}
      />

      {status && <SharingOverlay status={status} />}

      <ConfirmDialog
        open={discard !== null}
        onClose={() => setDiscard(null)}
        onConfirm={() => (discard === 'close' ? close() : startOver())}
        title="Discard post?"
        message="If you leave, your edits won't be saved."
        confirmLabel="Discard"
        danger
      />
    </div>
  )
}

/** Covers the editor while the post uploads. */
function SharingOverlay({ status }: { status: string }) {
  return (
    <div role="status" className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-elevated/90 backdrop-blur-sm">
      <div className="story-ring rounded-full p-[3px]">
        <div className="rounded-full bg-elevated p-4">
          <LogoMark size={44} />
        </div>
      </div>
      <p className="text-sm font-semibold">{status}</p>
    </div>
  )
}
