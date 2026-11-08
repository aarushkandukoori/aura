import { Search, X } from 'lucide-react'
import { useRef } from 'react'
import { cx } from '../../../lib/cx'

interface SearchBoxProps {
  value: string
  onChange: (value: string) => void
  /** Enter was pressed. */
  onSubmit?: () => void
  autoFocus?: boolean
  className?: string
}

/** The rounded search field with a magnifier and a clear button. */
export function SearchBox({ value, onChange, onSubmit, autoFocus, className }: SearchBoxProps) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <form
      role="search"
      className={cx('relative', className)}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit?.()
      }}
    >
      <Search size={18} strokeWidth={2} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoFocus={autoFocus}
        placeholder="Search"
        aria-label="Search people and hashtags"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={60}
        className="h-10 w-full rounded-xl bg-surface pl-10 pr-10 text-[15px] text-fg outline-none transition-shadow placeholder:text-muted focus:ring-2 focus:ring-accent/25 md:text-sm"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('')
            input.current?.focus()
          }}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full"
        >
          <span className="grid size-[18px] place-items-center rounded-full bg-muted/60 text-bg">
            <X size={12} strokeWidth={3} />
          </span>
        </button>
      )}
    </form>
  )
}
