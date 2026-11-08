/**
 * Groups notifications under headings: New, Today, This week, This month, Earlier.
 * Plain functions, no React, so they are easy to test.
 */
import type { Notification } from '../../lib/types'

export interface Section {
  title: string
  items: Notification[]
}

const DAY = 24 * 60 * 60 * 1000
const ORDER = ['New', 'Today', 'This week', 'This month', 'Earlier']

/** The time heading for a notification that isn't new. */
function timeHeading(createdAt: number, now: number): string {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  if (createdAt >= midnight.getTime()) return 'Today'
  if (createdAt >= now - 7 * DAY) return 'This week'
  if (createdAt >= now - 30 * DAY) return 'This month'
  return 'Earlier'
}

/**
 * Newest first within each section. `newIds` are the ones that were unread when the list opened
 * (or arrived while it was open): they go under "New" whatever their time.
 */
export function groupNotifications(items: Notification[], newIds: ReadonlySet<string>, now = Date.now()): Section[] {
  const groups = new Map<string, Notification[]>()
  const newestFirst = [...items].sort((a, b) => b.createdAt - a.createdAt)
  for (const item of newestFirst) {
    const title = newIds.has(item.id) ? 'New' : timeHeading(item.createdAt, now)
    groups.set(title, [...(groups.get(title) ?? []), item])
  }
  return ORDER.filter((title) => groups.has(title)).map((title) => ({ title, items: groups.get(title) ?? [] }))
}
