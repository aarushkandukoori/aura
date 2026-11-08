import { Eye } from 'lucide-react'
import { CountUp, LoadingBlock, Sheet, UserRow } from '../../components'
import { formatNumber } from '../../lib/format'
import type { ViewersResponse } from '../../lib/types'

interface ViewersSheetProps {
  open: boolean
  onClose: () => void
  /** null while loading. */
  viewers: ViewersResponse | null
}

/** Who saw my story: the total, the people we know by name (newest first) with their reaction, and the rest as a number. */
export function ViewersSheet({ open, onClose, viewers }: ViewersSheetProps) {
  const others = viewers ? viewers.total - viewers.viewers.length : 0
  return (
    <Sheet open={open} onClose={onClose} title="Viewers">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold">
        <Eye size={18} />
        <CountUp value={viewers?.total ?? 0} /> {viewers?.total === 1 ? 'view' : 'views'}
      </div>
      {!viewers ? (
        <LoadingBlock />
      ) : viewers.viewers.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-muted">No one has seen this yet. Give it a minute.</p>
      ) : (
        <div className="py-1">
          {viewers.viewers.map(({ account, reaction }) => (
            <UserRow key={account.id} account={account} right={reaction ? <span className="text-2xl" aria-label={`Reacted ${reaction}`}>{reaction}</span> : null} />
          ))}
          {others > 0 && (
            <p className="px-4 py-5 text-center text-sm text-muted">
              and {formatNumber(others)} {others === 1 ? 'other' : 'others'}
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}
