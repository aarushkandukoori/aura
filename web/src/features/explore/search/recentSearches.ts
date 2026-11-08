/**
 * Recent searches, kept in this browser's localStorage (newest first, at most 20).
 * The search page and the desktop search panel both read them with useRecentSearches(), and
 * every change notifies both, so they always agree.
 */
import { useSyncExternalStore } from 'react'
import { itemKey, type SearchItem } from './searchItems'

const STORAGE_KEY = 'aura-recent-searches'
const MAX_ITEMS = 20

let items: SearchItem[] = load()
const listeners = new Set<() => void>()

function load(): SearchItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as SearchItem[]) : []
  } catch {
    return [] // private mode or a broken value: start with no history
  }
}

function save(next: SearchItem[]): void {
  items = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage can be full or blocked; the list still works until the page reloads.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRecentSearches(): SearchItem[] {
  return useSyncExternalStore(subscribe, () => items)
}

/** Put an item at the top (moving it up if it was already there). */
export function addRecentSearch(item: SearchItem): void {
  const key = itemKey(item)
  save([item, ...items.filter((existing) => itemKey(existing) !== key)].slice(0, MAX_ITEMS))
}

export function removeRecentSearch(item: SearchItem): void {
  const key = itemKey(item)
  save(items.filter((existing) => itemKey(existing) !== key))
}

export function clearRecentSearches(): void {
  save([])
}
