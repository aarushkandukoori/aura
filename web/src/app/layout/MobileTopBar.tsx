import { Heart, Send } from 'lucide-react'
import { Link } from 'react-router'
import { Wordmark } from '../../components'
import { useStore } from '../../lib/store'
import { NavCount, NavDot } from './NavBadge'

/** The phone top bar on Home: wordmark (tap to scroll up), activity heart with a dot, messages with a count. */
export function MobileTopBar() {
  const badges = useStore((s) => s.badges)
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-safe backdrop-blur-xl md:hidden">
      <div className="flex h-[52px] items-center justify-between pl-4 pr-1.5">
        <Link to="/" aria-label="Aura home" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <Wordmark className="text-[30px]" />
        </Link>
        <div className="flex items-center">
          <Link to="/activity" aria-label="Notifications" className="relative grid size-11 place-items-center">
            <Heart size={26} strokeWidth={1.75} />
            {badges.notifications > 0 && <NavDot className="right-2 top-2" />}
          </Link>
          <Link to="/messages" aria-label="Messages" className="relative grid size-11 place-items-center">
            <Send size={24} strokeWidth={1.75} />
            <NavCount count={badges.messages} className="right-0.5 top-0.5" />
          </Link>
        </div>
      </div>
    </header>
  )
}
