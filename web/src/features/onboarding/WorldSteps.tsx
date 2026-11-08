/**
 * Onboarding steps about the world around the person: how they know their friends, and how popular they are.
 */
import { Check } from 'lucide-react'
import { cx } from '../../lib/cx'
import { SELECTED_CARD_STYLE, TierCards } from '../settings/TierCards'
import { ORIGINS } from './options'
import type { StepProps } from './ProfileSteps'
import { StepTitle } from './StepTitle'

export function OriginStep({ draft, update }: StepProps) {
  return (
    <>
      <StepTitle title="How do you know your friends?" subtitle="Your friends will remember it the same way." />
      <div role="radiogroup" aria-label="How you know your friends" className="grid gap-2.5">
        {ORIGINS.map((origin) => {
          const selected = draft.origin === origin.value
          return (
            <button
              key={origin.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => update({ origin: origin.value })}
              style={selected ? SELECTED_CARD_STYLE : undefined}
              className={cx(
                'flex w-full items-center gap-3.5 rounded-2xl border-2 px-3.5 py-3 text-left transition-[background-color,transform] active:scale-[0.99]',
                !selected && 'border-line hover:bg-surface',
              )}
            >
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-[22px]">
                {origin.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{origin.label}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{origin.hint}</span>
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
    </>
  )
}

export function TierStep({ draft, update }: StepProps) {
  return (
    <>
      <StepTitle title="How popular do you want to be?" subtitle="Pick the size of your world. You can switch anytime in Settings." />
      <TierCards value={draft.tier} onChange={(tier) => update({ tier })} />
    </>
  )
}
