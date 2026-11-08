/**
 * Interest chips: tap to pick, or add your own. Used by onboarding and Edit profile.
 */
import { Check, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { INTERESTS, MAX_INTERESTS } from './options'

const PRESET_VALUES = new Set(INTERESTS.map((interest) => interest.value))

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

interface InterestPickerProps {
  value: string[]
  onChange: (interests: string[]) => void
}

export function InterestPicker({ value, onChange }: InterestPickerProps) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const full = value.length >= MAX_INTERESTS
  // Interests the person typed themselves show up as chips too.
  const ownWords = value.filter((interest) => !PRESET_VALUES.has(interest))

  function toggle(interest: string) {
    if (value.includes(interest)) onChange(value.filter((item) => item !== interest))
    else if (!full) onChange([...value, interest])
  }

  function finishAdding() {
    const word = draft.trim().toLowerCase()
    setDraft('')
    setAdding(false)
    if (word && !value.includes(word) && !full) onChange([...value, word])
  }

  return (
    <div className="flex flex-wrap gap-2">
      {INTERESTS.map((interest) => {
        const selected = value.includes(interest.value)
        return (
          <Chip key={interest.value} emoji={interest.emoji} selected={selected} disabled={full && !selected} onClick={() => toggle(interest.value)}>
            {capitalize(interest.value)}
          </Chip>
        )
      })}
      {ownWords.map((word) => (
        <Chip key={word} emoji="✨" selected onClick={() => toggle(word)}>
          {capitalize(word)}
        </Chip>
      ))}

      {adding ? (
        <input
          autoFocus
          value={draft}
          maxLength={30}
          placeholder="Type an interest"
          aria-label="Add your own interest"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finishAdding}
          onKeyDown={(event) => {
            // Enter adds the word (and must not submit the onboarding step around it).
            if (event.key === 'Enter') {
              event.preventDefault()
              finishAdding()
            }
            if (event.key === 'Escape') {
              setDraft('')
              setAdding(false)
            }
          }}
          className="h-10 w-44 rounded-full border border-accent bg-surface px-4 text-sm outline-none ring-2 ring-accent/20"
        />
      ) : (
        <button
          type="button"
          disabled={full}
          onClick={() => setAdding(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-4 text-sm text-muted transition hover:bg-surface hover:text-fg disabled:opacity-40"
        >
          <Plus size={15} />
          Add your own
        </button>
      )}
    </div>
  )
}

interface ChipProps {
  emoji: string
  selected: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

/**
 * One interest. When picked, a check takes the emoji's place (in a slot of fixed width) and the
 * text keeps its weight, so the chip never changes size and the chips after it never jump.
 */
function Chip({ emoji, selected, disabled = false, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition active:scale-95 disabled:opacity-40',
        selected ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface',
      )}
    >
      <span aria-hidden className="grid w-5 place-items-center">
        {selected ? <Check size={15} strokeWidth={2.75} className="text-accent" /> : emoji}
      </span>
      {children}
    </button>
  )
}
