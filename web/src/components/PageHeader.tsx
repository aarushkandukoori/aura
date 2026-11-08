import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useGoBack } from '../app/navigation'
import { cx } from '../lib/cx'

interface PageHeaderProps {
  title?: ReactNode
  /** Show a back arrow. A string is where to go when there is no history (a direct load). */
  back?: boolean | string
  /** Buttons on the right. */
  right?: ReactNode
  className?: string
}

/**
 * The sticky bar at the top of a sub-page on phones: back arrow, centered title, actions.
 * Add className="md:hidden" when the desktop layout has its own heading.
 */
export function PageHeader({ title, back = true, right, className }: PageHeaderProps) {
  const goBack = useGoBack(typeof back === 'string' ? back : '/')
  return (
    <header className={cx('sticky top-0 z-30 border-b border-line bg-bg/90 pt-safe backdrop-blur-xl', className)}>
      <div className="grid h-12 grid-cols-[56px_1fr_56px] items-center px-1">
        <div>
          {back && (
            <button type="button" aria-label="Back" onClick={goBack} className="grid size-11 place-items-center rounded-full hover:opacity-60">
              <ChevronLeft size={28} strokeWidth={1.75} />
            </button>
          )}
        </div>
        <h1 className="truncate text-center text-base font-semibold">{title}</h1>
        <div className="flex justify-end">{right}</div>
      </div>
    </header>
  )
}
