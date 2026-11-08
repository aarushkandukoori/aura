/**
 * Formatting helpers for numbers, times and captions. Plain functions, no React.
 */

/** Short counts for stats and badges: 999 · 1,234 · 12.4K · 123K · 1.2M · 3.4B. */
export function formatCount(n: number): string {
  if (n < 10_000) return n.toLocaleString('en-US')
  if (n < 1_000_000) return trimDecimal(n / 1_000, n < 100_000) + 'K'
  if (n < 1_000_000_000) return trimDecimal(n / 1_000_000, n < 100_000_000) + 'M'
  return trimDecimal(n / 1_000_000_000, true) + 'B'
}

/** One decimal place (floored, so 12,990 shows 12.9K and never rounds up to a bigger unit), "12.0" -> "12". */
function trimDecimal(value: number, withDecimal: boolean): string {
  if (!withDecimal) return String(Math.floor(value))
  return (Math.floor(value * 10) / 10).toFixed(1).replace(/\.0$/, '')
}

/** Full number with commas: 1203 -> "1,203". Used for "Liked by x and 1,203 others". */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

/** "1 comment", "2 comments", "12.4K comments". */
export function pluralize(n: number, word: string, plural = word + 's'): string {
  return `${formatCount(n)} ${n === 1 ? word : plural}`
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/** Short relative time: now, 2m, 3h, 4d, 2w, then a date like "Mar 3" (or "Mar 3, 2025" in another year). */
export function timeAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms)
  if (diff < MINUTE) return 'now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d`
  if (diff < 5 * WEEK) return `${Math.floor(diff / WEEK)}w`
  return shortDate(ms, now)
}

/** Long relative time for under posts: "just now", "5 minutes ago", "3 hours ago", "2 days ago", "March 3". */
export function timeAgoLong(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms)
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), 'minute') + ' ago'
  if (diff < DAY) return plural(Math.floor(diff / HOUR), 'hour') + ' ago'
  if (diff < WEEK) return plural(Math.floor(diff / DAY), 'day') + ' ago'
  const date = new Date(ms)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: sameYear ? undefined : 'numeric' })
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function shortDate(ms: number, now: number): string {
  const date = new Date(ms)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })
}

/** Clock time for chats: "3:42 PM". */
export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** Time separators in a chat: "3:42 PM" today, "Yesterday 9:10 AM", "Mon 4:20 PM", "Mar 3, 4:20 PM". */
export function chatTime(ms: number, now = Date.now()): string {
  const date = new Date(ms)
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (ms >= startOfToday) return clockTime(ms)
  if (ms >= startOfToday - DAY) return `Yesterday ${clockTime(ms)}`
  if (ms >= startOfToday - 6 * DAY) return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${clockTime(ms)}`
  return `${shortDate(ms, now)}, ${clockTime(ms)}`
}

/** Shown as "Active now" when someone was active in the last 5 minutes. */
export function isActiveNow(lastActiveAt: number | null, now = Date.now()): boolean {
  return lastActiveAt !== null && now - lastActiveAt < 5 * MINUTE
}

/** "Active now", "Active 12m ago", "Active 3h ago", "Active yesterday", or "" when unknown/old. */
export function activeLabel(lastActiveAt: number | null, now = Date.now()): string {
  if (lastActiveAt === null) return ''
  const diff = now - lastActiveAt
  if (diff < 5 * MINUTE) return 'Active now'
  if (diff < HOUR) return `Active ${Math.floor(diff / MINUTE)}m ago`
  if (diff < DAY) return `Active ${Math.floor(diff / HOUR)}h ago`
  if (diff < 2 * DAY) return 'Active yesterday'
  return ''
}

/** "Maya Okonkwo" -> "Maya". */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName
}

/** A piece of a caption or comment: plain text, an @mention or a #hashtag. */
export type TextPart =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; username: string }
  | { kind: 'tag'; text: string; tag: string }

// @username (letters, digits, dots, underscores) or #tag (letters, digits, underscores, any language).
const LINK_PATTERN = /([@#])([\p{L}\p{N}_]+(?:\.[\p{L}\p{N}_]+)*)/gu

/**
 * Split text into plain parts, @mentions (-> /:username) and #tags (-> /explore/tags/:tag).
 * LinkifiedText renders the parts; this function stays free of React so it is easy to test.
 */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index ?? 0
    // "email@domain" is not a mention: the symbol must start the text or follow a non-word character.
    const before = start > 0 ? text[start - 1] : ''
    if (before && /[\p{L}\p{N}_]/u.test(before)) continue
    if (start > last) parts.push({ kind: 'text', text: text.slice(last, start) })
    const [whole, symbol, word] = match
    if (symbol === '@') parts.push({ kind: 'mention', text: whole, username: word.toLowerCase() })
    else parts.push({ kind: 'tag', text: whole, tag: word.toLowerCase() })
    last = start + whole.length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}
