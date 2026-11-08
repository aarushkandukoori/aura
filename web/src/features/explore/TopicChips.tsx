import { Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

interface TopicChipsProps {
  interests: string[]
  /** The selected interest, or null for "For you". */
  value: string | null
  onChange: (topic: string | null) => void
}

/** The row of topic chips above the explore grid: "For you" plus one chip per interest. */
export function TopicChips({ interests, value, onChange }: TopicChipsProps) {
  return (
    <div role="tablist" aria-label="Topics" className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3 md:px-0 md:pb-4 md:pt-0">
      <Chip active={value === null} onClick={() => onChange(null)}>
        <Sparkles size={15} strokeWidth={2} />
        For you
      </Chip>
      {interests.map((interest) => (
        <Chip key={interest} active={value === interest} onClick={() => onChange(interest)}>
          {capitalize(interest)}
        </Chip>
      ))}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-colors md:h-9',
        active ? 'bg-fg text-bg' : 'bg-surface text-fg hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
