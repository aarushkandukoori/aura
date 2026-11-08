/**
 * The notifications list (SPEC screen 12), used by the /activity page and the desktop
 * Notifications panel. Opening it loads the latest, marks everything read, and keeps what was
 * unread under "New". Live notifications slide in at the top; merged ones ("maya and 2,312
 * others liked your post") update in place, move up and glow for a moment.
 */
import { Heart } from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, EmptyState, LoadingBlock } from '../../components'
import { api } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useInfiniteScroll } from '../../lib/hooks'
import { useLiveEvent } from '../../lib/live'
import { useStore } from '../../lib/store'
import { NotificationRow } from './NotificationRow'
import { groupNotifications } from './sections'

type Status = 'loading' | 'ready' | 'error'

export function ActivityList({ compact = false }: { compact?: boolean }) {
  const notifications = useStore((s) => s.notifications)
  const cursor = useStore((s) => s.notificationsCursor)
  // Notifications cached from an earlier visit show right away while the fresh ones load.
  const [status, setStatus] = useState<Status>(() => (useStore.getState().notifications.length > 0 ? 'ready' : 'loading'))
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set())
  const [loadingMore, setLoadingMore] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [glowing, glow] = useGlow()
  const opened = useRef(false)
  // How many of the notifications on pages not loaded yet were unread when the list opened.
  const unreadOnLaterPages = useRef(0)

  useEffect(() => {
    let cancelled = false
    async function open() {
      let lastPageLoaded = true
      try {
        const page = await api.notifications()
        if (cancelled) return
        useStore.getState().setNotifications(page.items, page.nextCursor)
        lastPageLoaded = page.nextCursor === null
        setStatus('ready')
      } catch {
        if (cancelled) return
        // Nothing new could be shown, so nothing is marked read (cached notifications stay up).
        setStatus((current) => (current === 'ready' ? current : 'error'))
        return
      }
      // Remember what was unread (it stays under "New" while the list is open), then mark it all read.
      const store = useStore.getState()
      const unreadIds = store.notifications.filter((n) => !n.read).map((n) => n.id)
      setNewIds(new Set(unreadIds))
      // Unread ones are always the newest, so when this page was all unread, the next pages
      // start with the rest of them (the badge says how many there are in total).
      const wholePageUnread = unreadIds.length === store.notifications.length
      unreadOnLaterPages.current = !lastPageLoaded && wholePageUnread ? Math.max(0, store.badges.notifications - unreadIds.length) : 0
      opened.current = true
      if (store.badges.notifications > 0 || unreadIds.length > 0) store.markNotificationsRead()
    }
    open()
    return () => {
      cancelled = true
      // Whatever arrived while the list was open has been seen too.
      if (opened.current && useStore.getState().badges.notifications > 0) useStore.getState().markNotificationsRead()
    }
  }, [attempt])

  // Live: a new or updated notification joins "New" and glows. (The store already has it.)
  useLiveEvent('notification', ({ notification }) => {
    setNewIds((ids) => new Set(ids).add(notification.id))
    glow(notification.id)
  })

  async function loadMore() {
    const next = useStore.getState().notificationsCursor
    if (!next || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await api.notifications(next)
      // These were already marked read with the rest, but were new when the list opened.
      const stillNew = page.items.slice(0, unreadOnLaterPages.current).map((n) => n.id)
      unreadOnLaterPages.current -= stillNew.length
      if (stillNew.length > 0) setNewIds((ids) => new Set([...ids, ...stillNew]))
      useStore.getState().appendNotifications(page.items, page.nextCursor)
    } catch {
      // The sentinel asks again the next time it scrolls into view.
    } finally {
      setLoadingMore(false)
    }
  }
  const sentinel = useInfiniteScroll(loadMore, status === 'ready' && cursor !== null && !loadingMore)

  if (status === 'loading') return <ActivitySkeleton compact={compact} />
  if (status === 'error' && notifications.length === 0) {
    return (
      <EmptyState
        title="Couldn't load notifications"
        body="Check your connection and try again."
        action={<Button onClick={() => { setStatus('loading'); setAttempt((n) => n + 1) }}>Try again</Button>}
      />
    )
  }
  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={<Heart size={30} strokeWidth={1.5} />}
        title="Activity on your posts"
        body="When people like or comment on your posts, follow you or react to your stories, you'll see it here."
      />
    )
  }

  const sections = groupNotifications(notifications, newIds)
  return (
    <LayoutGroup>
      {sections.map((section, index) => (
        <section key={section.title} className={cx('pb-2', index > 0 && 'border-t border-line pt-2')}>
          <h3 className={cx('pb-1 pt-3 text-base font-bold', compact ? 'px-6' : 'px-4')}>{section.title}</h3>
          {section.items.map((notification) => {
            const lit = glowing.has(notification.id)
            return (
              <motion.div
                key={notification.id}
                layout="position"
                // Only rows that just arrived slide in; the first render appears as is.
                initial={lit ? { opacity: 0, y: -10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <NotificationRow notification={notification} highlight={lit} compact={compact} />
              </motion.div>
            )
          })}
        </section>
      ))}
      <div ref={sentinel} />
      {loadingMore && <LoadingBlock />}
    </LayoutGroup>
  )
}

/** Ids that just arrived or changed; each one glows for 1.6 s. Returns [ids, glow(id)]. */
function useGlow(): [ReadonlySet<string>, (id: string) => void] {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set())
  const timers = useRef(new Map<string, number>())

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const glow = useCallback((id: string) => {
    setIds((current) => new Set(current).add(id))
    window.clearTimeout(timers.current.get(id))
    timers.current.set(
      id,
      window.setTimeout(() => {
        setIds((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }, 1600),
    )
  }, [])

  return [ids, glow]
}

/** Gray placeholder rows while the first page loads. */
function ActivitySkeleton({ compact }: { compact: boolean }) {
  return (
    <div aria-label="Loading notifications" className={cx('pt-4', compact ? 'px-6' : 'px-4')}>
      <div className="shimmer mb-4 h-4 w-20 rounded" />
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 py-2.5">
          <div className="shimmer size-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="shimmer h-3 w-4/5 rounded" />
            <div className="shimmer h-3 w-2/5 rounded" />
          </div>
          <div className="shimmer size-11 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  )
}
