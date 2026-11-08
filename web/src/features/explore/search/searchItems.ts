/**
 * One search result (or recent search): a person or a hashtag. Plain helpers, no React.
 */
import type { Account, SearchResult } from '../../../lib/types'

export type SearchItem =
  | { type: 'account'; account: Account }
  | { type: 'tag'; tag: string; postCount: number }

/** A stable key per item, used for React keys and to de-duplicate recent searches. */
export function itemKey(item: SearchItem): string {
  return item.type === 'account' ? `@${item.account.id}` : `#${item.tag}`
}

/** Where tapping the item goes. */
export function itemHref(item: SearchItem): string {
  return item.type === 'account' ? `/${item.account.username}` : `/explore/tags/${encodeURIComponent(item.tag)}`
}

/** How many people come before the hashtags in the "top" mix. */
const PEOPLE_FIRST = 6

/**
 * Results in display order. A query starting with "#" lists hashtags first; otherwise the best
 * few people come first, then hashtags, then everyone else, so tags never get buried.
 */
export function orderResults(result: SearchResult, query: string): SearchItem[] {
  const people: SearchItem[] = result.accounts.map((account) => ({ type: 'account', account }))
  const tags: SearchItem[] = result.tags.map(({ tag, postCount }) => ({ type: 'tag', tag, postCount }))
  if (query.trim().startsWith('#')) return [...tags, ...people]
  return [...people.slice(0, PEOPLE_FIRST), ...tags, ...people.slice(PEOPLE_FIRST)]
}
