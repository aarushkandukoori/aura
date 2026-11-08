/**
 * Pick a profile photo: upload one (cropped to a square and shrunk first) or choose a preset.
 * Used by onboarding and Edit profile.
 */
import { Camera, Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar, Button, Img, Spinner, toast } from '../../components'
import { api } from '../../lib/api'
import { cx } from '../../lib/cx'
import { uploadCanvas } from '../../lib/upload'

/** Preset avatar URLs, fetched once per visit. */
let presetCache: string[] | null = null

/** The preset avatars from GET /api/avatars (works before onboarding). */
export function usePresets(): string[] {
  const [presets, setPresets] = useState<string[]>(presetCache ?? [])
  useEffect(() => {
    if (presetCache) return
    api.avatars()
      .then((urls) => {
        presetCache = urls
        setPresets(urls)
      })
      .catch(() => {}) // no presets: uploading still works
  }, [])
  return presets
}

const AVATAR_SIDE = 640

/** Crop the middle square of a photo, shrink it to 640 px and upload it. Returns the new URL. */
export async function uploadAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file) // also applies the photo's EXIF rotation
  const side = Math.min(bitmap.width, bitmap.height)
  const size = Math.min(side, AVATAR_SIDE)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.fillStyle = '#ffffff' // transparent PNGs would turn black as JPEG
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close()
  return (await uploadCanvas(canvas)).url
}

interface AvatarPickerProps {
  value: string | null
  onChange: (url: string | null) => void
  /** Diameter of the big preview. */
  previewSize?: number
}

export function AvatarPicker({ value, onChange, previewSize = 132 }: AvatarPickerProps) {
  const presets = usePresets()
  const input = useRef<HTMLInputElement>(null)
  // While uploading, the picked file shows right away from memory.
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('Pick a photo for your profile picture.')
      return
    }
    const preview = URL.createObjectURL(file)
    setLocalPreview(preview)
    try {
      onChange(await uploadAvatar(file))
    } catch {
      toast("Couldn't use that photo. Try another one.")
    } finally {
      setLocalPreview(null)
      URL.revokeObjectURL(preview)
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <div aria-hidden className="aura-gradient absolute -inset-4 rounded-full opacity-35 blur-2xl" />
        <div className="relative">
          <Avatar src={localPreview ?? value} size={previewSize} />
        </div>
        {localPreview && (
          <div className="absolute inset-0 grid place-items-center rounded-full bg-black/35 text-white">
            <Spinner size={28} />
          </div>
        )}
      </div>

      <Button className="mt-6" onClick={() => input.current?.click()} disabled={Boolean(localPreview)}>
        <Camera size={17} />
        {value ? 'Upload a different photo' : 'Upload a photo'}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          onFile(event.target.files?.[0])
          event.target.value = '' // picking the same file again should still work
        }}
      />

      {presets.length > 0 && (
        <>
          <p className="mb-3 mt-7 text-[13px] text-muted">or pick one of these</p>
          <div className="grid grid-cols-4 gap-3">
            {presets.map((url) => {
              const selected = url === value
              return (
                <button
                  key={url}
                  type="button"
                  aria-label="Use this picture"
                  aria-pressed={selected}
                  onClick={() => onChange(selected ? null : url)}
                  className={cx(
                    'relative rounded-full p-0.5 transition active:scale-95',
                    selected ? 'ring-2 ring-accent' : 'hover:opacity-85',
                  )}
                >
                  <Img src={url} alt="" className="size-14 rounded-full sm:size-16" />
                  {selected && (
                    <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-accent text-white ring-2 ring-bg">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
