/**
 * Notifications for the user ("maya liked your post", "You hit 50K followers").
 *
 * Likes and follows merge: while the "like" notification for a post is unread, new likes update
 * that same row ("maya and 1,203 others liked your post") and it jumps back to the top.
 */
import type { Badges, Notification, NotificationKind, Page } from '../../shared/types.ts'
import { newId, now, q } from '../db/index.ts'
import { broadcast } from '../live.ts'
import { toNotifications } from './dto.ts'
import { pageRows, readTimeCursor } from './paging.ts'
import type { NotificationRow } from './rows.ts'

const PAGE_SIZE = 40

export interface NewNotification {
  kind: NotificationKind
  /** Who did it (null for milestones). */
  actorId?: string | null
  /** How many people did it besides the actor ("and 1,203 others"). */
  others?: number
  postId?: string | null
  commentId?: string | null
  /** Comment text, reaction emoji or milestone message. */
  text?: string | null
  /** Unread notifications with the same key merge into one row, e.g. 'like:<postId>'. */
  groupKey?: string | null
}

/** Unread notifications, and conversations with unread messages (requests don't count). */
export function getBadges(): Badges {
  const row = q(`
    SELECT (SELECT COUNT(*) FROM notifications WHERE read = 0) AS notifications,
           (SELECT COUNT(*) FROM conversations WHERE unread > 0 AND is_request = 0) AS messages`).get() as
    { notifications: number; messages: number }
  return { notifications: row.notifications, messages: row.messages }
}

/** The unread notification that a new one with this key would merge into, if there is one. */
export function unreadGroup(groupKey: string): NotificationRow | undefined {
  return q('SELECT * FROM notifications WHERE group_key = ? AND read = 0 ORDER BY created_at DESC LIMIT 1')
    .get(groupKey) as NotificationRow | undefined
}

const exists = (table: 'accounts' | 'posts', id: string) => q(`SELECT 1 FROM ${table} WHERE id = ?`).get(id) !== undefined

/**
 * Add a notification for the user, or merge it into the unread one with the same groupKey, then
 * broadcast it with fresh badges. Returns the notification as the apps received it, or null (and
 * does nothing) when the user, the actor or the post doesn't exist (e.g. a job left over from
 * before "Start over").
 */
export function pushNotification(input: NewNotification): Notification | null {
  if (!exists('accounts', 'me')) return null
  if (input.actorId && !exists('accounts', input.actorId)) return null
  if (input.postId && !exists('posts', input.postId)) return null
  const time = now()
  const existing = input.groupKey ? unreadGroup(input.groupKey) : undefined
  let id: string
  if (existing) {
    // Everyone already counted plus the newcomers. The newest named actor goes in front.
    const people = existing.others + (existing.actor_id ? 1 : 0) + (input.others ?? 0) + (input.actorId ? 1 : 0)
    const actorId = input.actorId ?? existing.actor_id
    q('UPDATE notifications SET actor_id = ?, others = ?, text = ?, comment_id = ?, created_at = ? WHERE id = ?').run(
      actorId, people - (actorId ? 1 : 0), input.text ?? existing.text, input.commentId ?? existing.comment_id, time, existing.id,
    )
    id = existing.id
  } else {
    id = newId('n')
    q(`INSERT INTO notifications (id, kind, actor_id, others, post_id, comment_id, text, group_key, read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`).run(
      id, input.kind, input.actorId ?? null, Math.max(0, input.others ?? 0), input.postId ?? null,
      input.commentId ?? null, input.text ?? null, input.groupKey ?? null, time,
    )
  }
  const row = q('SELECT * FROM notifications WHERE id = ?').get(id) as unknown as NotificationRow
  const notification = toNotifications([row])[0]
  broadcast({ type: 'notification', notification, badges: getBadges() })
  return notification
}

/** Newest first, 40 per page. */
export function listNotifications(cursor: string | null): Page<Notification> {
  const from = readTimeCursor(cursor)
  const rows = q(`
    SELECT * FROM notifications WHERE created_at < ? OR (created_at = ? AND id < ?)
    ORDER BY created_at DESC, id DESC LIMIT ?`).all(from.t, from.t, from.id, PAGE_SIZE + 1) as NotificationRow[]
  const page = pageRows(rows, PAGE_SIZE)
  return { items: toNotifications(page.rows), nextCursor: page.nextCursor }
}

/** Mark every notification read. Broadcasts the new badges, so other open apps clear their dot too. */
export function markAllNotificationsRead(): Badges {
  q('UPDATE notifications SET read = 1 WHERE read = 0').run()
  const badges = getBadges()
  broadcast({ type: 'badges', badges })
  return badges
}

/** Show a celebration (confetti + card) in every open app. */
export function celebrate(title: string, body: string): void {
  broadcast({ type: 'milestone', title, body })
}

/** Slide a push-style banner into every open app, e.g. "✨ kenji liked your post" (href: an in-app path). */
export function showBanner(banner: { title: string; body: string; avatar?: string | null; href?: string | null }): void {
  broadcast({ type: 'banner', title: banner.title, body: banner.body, avatar: banner.avatar ?? null, href: banner.href ?? null })
}
