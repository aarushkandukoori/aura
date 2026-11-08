/**
 * "Copy link" for posts, reels and profiles, so every copy button behaves the same.
 */
import { useStore } from './store'

/**
 * Copy the full link to an in-app path ("/p/abc") and say so in a toast. Without clipboard access
 * (for example when the app is opened over plain http from a phone on the local network) the toast
 * shows the link itself instead, so it can still be copied by hand.
 */
export async function copyLink(path: string, message = 'Link copied', icon?: string): Promise<void> {
  const url = `${window.location.origin}${path}`
  try {
    await navigator.clipboard.writeText(url)
    useStore.getState().pushToast({ message, icon })
  } catch {
    useStore.getState().pushToast({ message: url })
  }
}
