import { Clapperboard, House, Search, SquarePlus, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { Avatar } from '../../components'
import { cx } from '../../lib/cx'
import { useMe } from '../../lib/store'
import { useBackgroundLocation } from '../navigation'

/** The phone bottom tab bar: Home, Explore, Create, Reels, Profile. Turns dark on Reels. */
export function MobileTabBar() {
  const me = useMe()
  const location = useLocation()
  const background = useBackgroundLocation()
  const path = (background ?? location).pathname
  const onReels = path.startsWith('/reels')
  const onProfile = path === `/${me.username}` || path.startsWith(`/${me.username}/`)

  return (
    <nav
      aria-label="Main"
      className={cx(
        'fixed inset-x-0 bottom-0 z-40 border-t pb-safe md:hidden',
        onReels ? 'border-white/10 bg-black text-white' : 'border-line bg-bg/95 text-fg backdrop-blur-xl',
      )}
    >
      <div className="flex h-[50px] items-stretch justify-around">
        <Tab to="/" label="Home" icon={House} active={path === '/'} scrollTopWhenActive />
        <Tab to="/explore" label="Explore" icon={Search} active={path.startsWith('/explore') || path === '/search'} />
        <Tab to="/create" label="Create" icon={SquarePlus} active={path === '/create'} />
        <Tab to="/reels" label="Reels" icon={Clapperboard} active={onReels} />
        <Link to={`/${me.username}`} aria-label="Profile" className="grid flex-1 place-items-center">
          <span className={cx('rounded-full p-[1.5px]', onProfile ? (onReels ? 'ring-2 ring-white' : 'ring-2 ring-fg') : '')}>
            <Avatar account={me} size={26} />
          </span>
        </Link>
      </div>
    </nav>
  )
}

function Tab({ to, label, icon: Icon, active, scrollTopWhenActive = false }: {
  to: string
  label: string
  icon: LucideIcon
  active: boolean
  scrollTopWhenActive?: boolean
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={() => {
        if (active && scrollTopWhenActive) window.scrollTo({ top: 0, behavior: 'smooth' })
      }}
      className="grid flex-1 place-items-center active:opacity-60"
    >
      <Icon size={26} strokeWidth={active ? 2.5 : 1.75} />
    </Link>
  )
}
