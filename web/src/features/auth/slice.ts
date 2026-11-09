/**
 * Store slice: who is signed in. lib/store.ts adds it to the app's store and fills it from every
 * Session the server sends (GET /api/session, POST /api/onboarding...).
 *
 *   const account = useStore((s) => s.account)   // { id, email, name, picture } or null
 */
import { api } from '../../lib/api'
import type { Slice } from '../../lib/store'
import type { SignedInAccount } from '../../lib/types'

export interface AuthSlice {
  /** true when the server has sign-in turned on (each Google account has its own world). false = local mode. */
  authEnabled: boolean
  /** The signed-in Google account; null when signed out (or in local mode, where nobody signs in). */
  account: SignedInAccount | null
  /** The server stopped accepting our session (it expired, or we signed out in another tab). */
  markSignedOut: () => void
  /** Sign out on the server, then reload into the sign-in page with a clean slate. */
  signOut: () => Promise<void>
}

export const createAuthSlice: Slice<AuthSlice> = (set) => ({
  authEnabled: false,
  account: null,
  // The sign-in page then shows; the old session's badges (tab title) and banners go with it.
  markSignedOut: () => set({ account: null, badges: { notifications: 0, messages: 0 }, banners: [] }),
  signOut: async () => {
    await api.logout()
    window.location.replace('/signin')
  },
})
