import { useState } from 'react'
import { CountUp, Sheet } from '../../components'
import { formatCount, formatNumber } from '../../lib/format'

/** A thin aura-gradient border around a pill (one background clipped to the padding, one to the border). */
const CHIP_STYLE = {
  background: 'linear-gradient(var(--bg), var(--bg)) padding-box, var(--aura-gradient) border-box',
  border: '1.5px solid transparent',
}

/** "✦ 12.4K aura" on my profile. It rolls up live as people engage; tapping explains it. */
export function AuraChip({ aura }: { aura: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={CHIP_STYLE}
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition active:scale-95"
      >
        <span aria-hidden className="aura-text text-base leading-none">✦</span>
        <CountUp value={aura} format={formatCount} />
        <span>aura</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your aura">
        <div className="flex flex-col items-center px-8 pb-8 pt-6 text-center">
          <span className="aura-text font-brand text-6xl font-semibold leading-tight">✦ {formatCount(aura)}</span>
          <p className="mt-1 text-sm text-muted">{formatNumber(aura)} aura</p>
          <p className="mt-5 max-w-[300px] text-[15px] leading-relaxed">
            Your aura grows every time people like, comment on and share your posts, watch your stories and follow you.
          </p>
        </div>
      </Sheet>
    </>
  )
}
