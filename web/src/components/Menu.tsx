import { Ellipsis } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/cx'
import { useEscapeKey, useIsMobile } from '../lib/hooks'
import { Sheet } from './Sheet'

export interface MenuItem {
  label: string
  onSelect: () => void
  icon?: ReactNode
  /** Red text, for destructive actions like Delete. */
  danger?: boolean
}

interface MenuProps {
  items: MenuItem[]
  /** Accessible name of the trigger button. */
  label?: string
  /** What the trigger button shows (default: a ⋯ icon). */
  trigger?: ReactNode
  /** Which edge of the trigger the popover lines up with on desktop. */
  align?: 'start' | 'end'
  /** Extra classes for the trigger button. */
  className?: string
}

/**
 * A ⋯ options menu: a small popover next to the button on desktop, an action sheet on phones.
 *   <Menu items={[{ label: 'Delete', danger: true, onSelect: remove }, { label: 'Copy link', onSelect: copy }]} />
 */
export function Menu({ items, label = 'More options', trigger, align = 'end', className }: MenuProps) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const isMobile = useIsMobile()
  const close = () => setOpen(false)
  const choose = (item: MenuItem) => {
    close()
    // Back on the ⋯ button first, so a dialog the item opens returns focus there when it closes.
    button.current?.focus({ preventScroll: true })
    item.onSelect()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
        className={cx('inline-grid size-10 shrink-0 place-items-center rounded-full transition hover:opacity-60', className)}
      >
        {trigger ?? <Ellipsis size={22} />}
      </button>

      {isMobile ? (
        <Sheet open={open} onClose={close}>
          <div role="menu" className="pb-2">
            {items.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                type="button"
                onClick={() => choose(item)}
                className={cx('flex h-13 w-full items-center gap-3 px-5 text-[15px] active:bg-surface', item.danger && 'font-semibold text-danger')}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
            <button type="button" onClick={close} className="flex h-13 w-full items-center px-5 text-[15px] text-muted active:bg-surface">
              Cancel
            </button>
          </div>
        </Sheet>
      ) : (
        <AnimatePresence>{open && <Popover anchor={button.current} align={align} items={items} onChoose={choose} onClose={close} />}</AnimatePresence>
      )}
    </>
  )
}

const WIDTH = 230

function Popover({ anchor, align, items, onChoose, onClose }: {
  anchor: HTMLElement | null
  align: 'start' | 'end'
  items: MenuItem[]
  onChoose: (item: MenuItem) => void
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  // The keyboard works like a native menu: it starts on the first item, the arrows (and Home/End)
  // move between items, and Escape or Tab close it with focus back on the ⋯ button (so Tab then
  // carries on from there). The popover lives at the end of the page, out of the normal tab order.
  const closeToButton = () => {
    onClose()
    anchor?.focus({ preventScroll: true })
  }
  useEscapeKey(closeToButton)

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
  }, [])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      closeToButton()
      return
    }
    const buttons = [...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLElement)
    const last = buttons.length - 1
    let next = -1
    if (event.key === 'ArrowDown') next = index >= last ? 0 : index + 1
    else if (event.key === 'ArrowUp') next = index <= 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next < 0 || !buttons[next]) return
    event.preventDefault() // the arrows would scroll the page, which closes the menu
    buttons[next].focus()
  }

  // Place it under the button (or above, if there is no room), kept inside the window.
  useLayoutEffect(() => {
    if (!anchor || !panel.current) return
    const rect = anchor.getBoundingClientRect()
    const height = panel.current.offsetHeight
    const below = rect.bottom + 6
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - 6 - height) : below
    const left = align === 'end' ? rect.right - WIDTH : rect.left
    setPosition({ top, left: Math.min(Math.max(8, left), window.innerWidth - WIDTH - 8) })
  }, [anchor, align])

  // Close on a click elsewhere, or when the page scrolls or resizes under it.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !anchor?.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [anchor, onClose])

  return createPortal(
    <motion.div
      ref={panel}
      role="menu"
      onKeyDown={onKeyDown}
      className="fixed z-[80] overflow-hidden rounded-xl border border-line bg-elevated py-1.5 text-fg shadow-pop"
      style={{ width: WIDTH, top: position?.top ?? -9999, left: position?.left ?? -9999 }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.12 }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          type="button"
          onClick={() => onChoose(item)}
          className={cx(
            'flex h-10 w-full items-center gap-3 px-4 text-left text-sm hover:bg-surface focus-visible:bg-surface focus-visible:-outline-offset-2',
            item.danger && 'font-semibold text-danger',
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </motion.div>,
    document.body,
  )
}
