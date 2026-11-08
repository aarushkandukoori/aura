import { useEffect, useRef, type PointerEvent } from 'react'
import { cx } from '../../lib/cx'
import { useEscapeKey } from '../../lib/hooks'
import type { StoryOverlay } from '../../lib/types'

const WHITE = '#FFFFFF'
const DARK = '#0E0E11'
export const TEXT_COLORS = [WHITE, DARK, '#FF3D6E', '#FFC36B', '#5CE1B5', '#5BB8FF', '#9B7BFF', '#FF7EC7']
const DARK_PILL = 'rgba(0,0,0,0.55)'
const LIGHT_PILL = 'rgba(255,255,255,0.92)'
/** No pill, a dark pill, a light pill. */
export const TEXT_BACKGROUNDS: (string | null)[] = [null, DARK_PILL, LIGHT_PILL]

/** Tapping a color or the pill button keeps the text box focused, so a phone keyboard stays open. */
function keepTyping(event: PointerEvent) {
  event.preventDefault()
}

/** Text that would vanish on the new pill (white on the light one, dark on the dark one) switches to the other color. */
function readableOn(background: string | null, color: string | null | undefined): string | null | undefined {
  const current = (color ?? WHITE).toUpperCase()
  if (background === LIGHT_PILL && current === WHITE) return DARK
  if (background === DARK_PILL && current === DARK) return WHITE
  return color
}

interface StoryTextEditorProps {
  overlay: StoryOverlay
  onChange: (overlay: StoryOverlay) => void
  onDone: () => void
}

/**
 * Typing the story text: the photo dims, a centered text box with the chosen color, a row of
 * colors, a button that cycles the pill behind the text, and Done.
 */
export function StoryTextEditor({ overlay, onChange, onDone }: StoryTextEditorProps) {
  const box = useRef<HTMLTextAreaElement>(null)
  useEscapeKey(onDone)

  useEffect(() => {
    // Focus with the caret at the end when editing existing text.
    const element = box.current
    if (!element) return
    element.focus()
    element.setSelectionRange(element.value.length, element.value.length)
  }, [])

  const backgroundIndex = Math.max(0, TEXT_BACKGROUNDS.indexOf(overlay.background ?? null))
  const nextBackground = TEXT_BACKGROUNDS[(backgroundIndex + 1) % TEXT_BACKGROUNDS.length]

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-black/55 backdrop-blur-[2px]">
      <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),12px)]">
        <button
          type="button"
          aria-label="Change the text background"
          onPointerDown={keepTyping}
          onClick={() => onChange({ ...overlay, background: nextBackground, color: readableOn(nextBackground, overlay.color) })}
          className="grid size-10 place-items-center rounded-lg border-2 border-white text-lg font-bold"
          style={{ backgroundColor: overlay.background ?? 'transparent', color: overlay.background ? overlay.color ?? '#fff' : '#fff' }}
        >
          A
        </button>
        <button type="button" onClick={onDone} className="h-10 rounded-full bg-white px-4 text-sm font-semibold text-black">
          Done
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-[6%]" onClick={(event) => event.target === event.currentTarget && onDone()}>
        {/* The chosen pill is drawn behind the text while typing too, so you see how it will look.
            Where the browser can size a text box to its content (field-sizing), it hugs the text
            like the finished pill; elsewhere it stays full width. */}
        <textarea
          ref={box}
          value={overlay.text ?? ''}
          onChange={(event) => onChange({ ...overlay, text: event.target.value })}
          placeholder="Type something…"
          aria-label="Story text"
          maxLength={200}
          rows={3}
          className="field-sizing-content w-full min-w-[4ch] max-w-full resize-none rounded-[0.35em] supports-[field-sizing:content]:w-auto px-[0.45em] py-[0.15em] text-center font-semibold leading-tight outline-none placeholder:text-current/60"
          style={{
            color: overlay.color ?? WHITE,
            backgroundColor: overlay.background ?? 'transparent',
            fontSize: 'clamp(16px, 6.2cqw, 32px)',
            textShadow: overlay.background ? 'none' : '0 1px 10px rgb(0 0 0 / 0.35)',
          }}
        />
      </div>

      <div className="flex justify-center gap-2.5 px-3 pb-[max(env(safe-area-inset-bottom),18px)]" role="radiogroup" aria-label="Text color">
        {TEXT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={overlay.color === color}
            aria-label={`Text color ${color}`}
            onPointerDown={keepTyping}
            onClick={() => onChange({ ...overlay, color })}
            className={cx('size-7 rounded-full border-2 transition', overlay.color === color ? 'scale-115 border-white' : 'border-white/70')}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  )
}
