import { useOpenHighlight } from '../../app/navigation'
import { Img } from '../../components'
import type { Highlight } from '../../lib/types'

/** The row of story highlights under a profile header; each one opens the highlight viewer. */
export function Highlights({ highlights, phone }: { highlights: Highlight[]; phone: boolean }) {
  const openHighlight = useOpenHighlight()
  if (highlights.length === 0) return null
  const size = phone ? 58 : 77
  return (
    <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-5 pt-1 md:gap-10 md:px-12 md:pb-11">
      {highlights.map((highlight) => (
        <div key={highlight.id} className="flex shrink-0 flex-col items-center gap-1.5" style={{ width: size + 14 }}>
          <button
            type="button"
            aria-label={`Open highlight: ${highlight.title}`}
            onClick={() => openHighlight(highlight.id)}
            className="rounded-full border border-line-strong p-[3px] transition active:scale-95"
          >
            <Img src={highlight.cover} alt="" className="rounded-full" style={{ width: size, height: size }} />
          </button>
          <span className="w-full truncate text-center text-xs font-semibold">{highlight.title}</span>
        </div>
      ))}
    </div>
  )
}
