import { Check } from 'lucide-react'
import { cx } from '../../lib/cx'
import { formatCount } from '../../lib/format'
import type { Tier } from '../../lib/types'
import { TIER_OPTIONS } from './tiers'

/**
 * A selected card: a soft lilac fill inside an aura-gradient border (two backgrounds, one clipped to
 * the padding box and one to the border box). Also used by the onboarding "how do you know" cards.
 */
export const SELECTED_CARD_STYLE = {
  background: 'linear-gradient(var(--accent-soft), var(--accent-soft)) padding-box, var(--aura-gradient) border-box',
  borderColor: 'transparent',
}

interface TierCardsProps {
  value: Tier
  onChange: (tier: Tier) => void
  disabled?: boolean
}

/** The four popularity tiers as selectable cards. Used by onboarding (pick one) and Settings (switch live). */
export function TierCards({ value, onChange, disabled = false }: TierCardsProps) {
  return (
    <div role="radiogroup" aria-label="Popularity" className="grid gap-2.5">
      {TIER_OPTIONS.map((tier) => {
        const selected = tier.value === value
        return (
          <button
            key={tier.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(tier.value)}
            style={selected ? SELECTED_CARD_STYLE : undefined}
            className={cx(
              'flex w-full items-center gap-3.5 rounded-2xl border-2 px-3.5 py-3 text-left transition-[background-color,transform] active:scale-[0.99] disabled:opacity-60',
              !selected && 'border-line hover:bg-surface',
            )}
          >
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-[22px]">
              {tier.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-[15px] font-semibold">{tier.label}</span>
                <span className="text-[13px] font-semibold tabular-nums text-muted">{formatCount(tier.followers)} followers</span>
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted">{tier.blurb}</span>
            </span>
            <span
              aria-hidden
              className={cx(
                'grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors',
                selected ? 'border-accent bg-accent text-white' : 'border-line-strong',
              )}
            >
              {selected && <Check size={14} strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
