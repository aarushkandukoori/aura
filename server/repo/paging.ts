/**
 * Cursors for paged lists.
 *
 * A cursor is a tiny object that says where the last page stopped (for example "the last post had
 * created_at 1731000000000 and id p_abc"), turned into a URL-safe string. Clients treat it as
 * opaque and send back whatever nextCursor they received.
 *
 * Most lists use "keyset" paging on (created_at, id): the next page is everything strictly older
 * than the last item. Unlike OFFSET paging, new items arriving at the top never cause duplicates.
 */

export function encodeCursor(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/** Read a cursor back. A missing or unreadable cursor means "start from the top". */
export function decodeCursor<T extends object>(cursor: string | null | undefined): T | null {
  if (!cursor) return null
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    return value && typeof value === 'object' ? (value as T) : null
  } catch {
    return null
  }
}

/** Position in a list sorted newest first by (created_at, id). */
export interface TimeCursor {
  t: number
  id: string
}

/** The starting position: newer than everything. */
export const FROM_TOP: TimeCursor = { t: Number.MAX_SAFE_INTEGER, id: '' }

/** Is this a well-formed position? Cursors come back from clients, so check before SQL uses them. */
export function isTimeCursor(value: unknown): value is TimeCursor {
  const cursor = value as Partial<TimeCursor> | null | undefined
  return typeof cursor?.t === 'number' && typeof cursor.id === 'string'
}

/** Decode a keyset cursor, falling back to the top for anything missing or malformed. */
export function readTimeCursor(cursor: string | null | undefined): TimeCursor {
  const value = decodeCursor<object>(cursor)
  return isTimeCursor(value) ? { t: value.t, id: value.id } : FROM_TOP
}

/**
 * Lists fetch one row more than a page. If that extra row exists there is another page, and the
 * cursor points at the last row we actually return.
 */
export function pageRows<R extends { created_at: number; id: string }>(
  rows: R[],
  limit: number,
): { rows: R[]; nextCursor: string | null } {
  if (rows.length <= limit) return { rows, nextCursor: null }
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return { rows: page, nextCursor: encodeCursor({ t: last.created_at, id: last.id }) }
}

/** Offset cursors, for lists that are ranked in code (explore, follower lists). */
export function readOffset(cursor: string | null | undefined): number {
  const value = decodeCursor<{ o?: unknown }>(cursor)
  return value && typeof value.o === 'number' && value.o > 0 ? Math.floor(value.o) : 0
}

export function offsetCursor(offset: number, total: number): string | null {
  return offset < total ? encodeCursor({ o: offset }) : null
}
