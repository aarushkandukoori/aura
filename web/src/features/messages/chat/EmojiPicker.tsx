import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useEscapeKey } from '../../../lib/hooks'
import { PICKER_EMOJI } from '../emoji'

interface EmojiPickerProps {
  onPick: (emoji: string) => void
  onClose: () => void
}

/**
 * The composer's emoji grid, floating above the message box. It stays open for picking several;
 * a tap outside (except on the button that toggles it) or Escape closes it.
 */
export function EmojiPicker({ onPick, onClose }: EmojiPickerProps) {
  const panel = useRef<HTMLDivElement>(null)
  useEscapeKey(onClose)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element
      if (panel.current?.contains(target) || target.closest('[data-emoji-toggle]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  return (
    <motion.div
      ref={panel}
      role="dialog"
      aria-label="Emoji"
      className="absolute bottom-full left-0 z-30 mb-2 w-[min(320px,calc(100vw-24px))] rounded-2xl border border-line bg-elevated p-2 shadow-pop"
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.14 }}
      style={{ transformOrigin: 'bottom left' }}
    >
      <p className="px-1.5 pb-1.5 pt-0.5 text-xs font-semibold text-muted">Emoji</p>
      <div className="grid grid-cols-8">
        {PICKER_EMOJI.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            // Keep the focus (and the phone keyboard) in the message box.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(emoji)}
            className="grid aspect-square place-items-center rounded-lg text-[22px] transition-transform hover:scale-110 hover:bg-surface"
          >
            {emoji}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
