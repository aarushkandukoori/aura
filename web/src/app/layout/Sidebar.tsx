import { Clapperboard, Compass, Heart, House, Search, Send, Settings, SquarePlus, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { Avatar, LogoMark, Wordmark } from '../../components'
import { ActivityList } from '../../features/activity'
import { SearchPanel } from '../../features/explore'
import { cx } from '../../lib/cx'
import { useMe, useStore } from '../../lib/store'
import { useBackgroundLocation, useOpenCreate } from '../navigation'
import { NavCount, NavDot } from './NavBadge'
import { SidePanel } from './SidePanel'

type Panel = 'search' | 'notifications' | null

/**
 * The desktop sidebar: 72 px of icons from 768 px, 244 px with labels from 1280 px. Opening Search or
 * Notifications collapses it to icons and slides that panel out beside it.
 */
export function Sidebar() {
  const me = useMe()
  const badges = useStore((s) => s.badges)
  const openCreate = useOpenCreate()
  const location = useLocation()
  const background = useBackgroundLocation()
  const path = (background ?? location).pathname
  const [panel, setPanel] = useState<Panel>(null)
  const collapsed = panel !== null

  // Going to another page (say, a search result) closes the panel.
  useEffect(() => setPanel(null), [location.pathname])

  const toggle = (name: Exclude<Panel, null>) => setPanel((current) => (current === name ? null : name))
  const onProfile = path === `/${me.username}` || path.startsWith(`/${me.username}/`)

  return (
    <>
      <nav
        aria-label="Main"
        className={cx(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-bg px-3 pb-5 pt-2 transition-[width] duration-200 md:flex',
          collapsed ? 'w-[72px]' : 'w-[72px] xl:w-[244px]',
        )}
      >
        <Link to="/" aria-label="Aura home" className="mb-4 flex h-[72px] items-center px-2.5">
          <LogoMark size={28} className={cx(!collapsed && 'xl:hidden')} />
          {!collapsed && <Wordmark className="hidden pl-1 text-[30px] xl:block" />}
        </Link>

        <div className="flex flex-1 flex-col gap-1">
          <NavItem label="Home" icon={House} to="/" active={!collapsed && path === '/'} collapsed={collapsed} />
          <NavItem label="Search" icon={Search} onClick={() => toggle('search')} active={panel === 'search'} collapsed={collapsed} />
          <NavItem label="Explore" icon={Compass} to="/explore" active={!collapsed && path.startsWith('/explore')} collapsed={collapsed} />
          <NavItem label="Reels" icon={Clapperboard} to="/reels" active={!collapsed && path.startsWith('/reels')} collapsed={collapsed} />
          <NavItem
            label="Messages"
            icon={Send}
            to="/messages"
            active={!collapsed && path.startsWith('/messages')}
            collapsed={collapsed}
            badge={<NavCount count={badges.messages} />}
          />
          <NavItem
            label="Notifications"
            icon={Heart}
            onClick={() => toggle('notifications')}
            active={panel === 'notifications'}
            collapsed={collapsed}
            // No dot while the panel is open: new notifications show up right there in the list.
            badge={badges.notifications > 0 && panel !== 'notifications' ? <NavDot className="-right-0.5 -top-0.5" /> : null}
          />
          <NavItem label="Create" icon={SquarePlus} onClick={openCreate} active={false} collapsed={collapsed} />
          <NavItem
            label="Profile"
            to={`/${me.username}`}
            active={!collapsed && onProfile}
            collapsed={collapsed}
            image={
              <span className={cx('block rounded-full', !collapsed && onProfile && 'ring-2 ring-fg ring-offset-1 ring-offset-bg')}>
                <Avatar account={me} size={26} />
              </span>
            }
          />
        </div>

        <NavItem label="Settings" icon={Settings} to="/settings" active={!collapsed && path.startsWith('/settings')} collapsed={collapsed} />
      </nav>

      <SidePanel open={panel === 'search'} onClose={() => setPanel(null)} label="Search">
        <SearchPanel onClose={() => setPanel(null)} />
      </SidePanel>
      <SidePanel open={panel === 'notifications'} onClose={() => setPanel(null)} label="Notifications">
        <h2 className="px-6 pb-3 pt-6 text-2xl font-bold">Notifications</h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ActivityList compact />
        </div>
      </SidePanel>
    </>
  )
}

interface NavItemProps {
  label: string
  icon?: LucideIcon
  /** Used instead of an icon (the profile avatar). */
  image?: ReactNode
  to?: string
  onClick?: () => void
  active: boolean
  collapsed: boolean
  badge?: ReactNode
}

function NavItem({ label, icon: Icon, image, to, onClick, active, collapsed, badge }: NavItemProps) {
  const content = (
    <>
      <span className="relative grid size-7 shrink-0 place-items-center transition-transform duration-150 group-hover:scale-105 group-active:scale-95">
        {image ?? (Icon && <Icon size={26} strokeWidth={active ? 2.5 : 1.75} />)}
        {badge}
      </span>
      {!collapsed && <span className={cx('hidden truncate text-[15px] xl:block', active && 'font-bold')}>{label}</span>}
    </>
  )
  const classes = 'group flex h-12 w-full items-center gap-4 rounded-lg px-2.5 text-fg transition-colors hover:bg-surface'
  return to ? (
    <Link to={to} title={label} aria-label={label} aria-current={active ? 'page' : undefined} className={classes} onClick={onClick}>
      {content}
    </Link>
  ) : (
    <button type="button" title={label} aria-label={label} aria-pressed={active} className={classes} onClick={onClick}>
      {content}
    </button>
  )
}
