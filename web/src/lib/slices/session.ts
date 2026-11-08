/**
 * Store slice: the session (who I am, settings, nav badges) and global UI
 * (banners, toasts, the milestone celebration, theme, live connection status).
 */
import { MOBILE_QUERY } from '../hooks'
import { applyTheme, loadThemePreference, saveThemePreference, type ThemePreference } from '../theme'
import type { Slice } from '../store'
import type { Badges, Me, Session, Settings, Tier } from '../types'

/** count: how many messages this banner stands for (later ones from the same chat update it). */
export interface Banner { id: number; title: string; body: string; avatar: string | null; href: string | null; count: number }
export interface Toast { id: number; message: string; icon?: string; action?: { label: string; href: string } }
export interface Milestone { title: string; body: string }
/** verified and tier only come after a tier change (which may have been made on another device). */
export type MeStats = { followers: number; following: number; postCount: number; aura: number; verified?: boolean; tier?: Tier }

export interface SessionSlice {
  /** true once GET /api/session has answered. */
  ready: boolean
  onboarded: boolean
  me: Me | null
  settings: Settings | null
  badges: Badges
  banners: Banner[]
  toasts: Toast[]
  milestone: Milestone | null
  theme: ThemePreference
  /** Whether the live event stream is connected right now. */
  connected: boolean

  setSession: (session: Session) => void
  setMe: (me: Me) => void
  applyMeStats: (stats: MeStats) => void
  setSettings: (settings: Settings) => void
  setBadges: (badges: Badges) => void
  /** Slide in a push-style banner. Skipped for the chat that is open right now and for muted chats. */
  pushBanner: (banner: Omit<Banner, 'id' | 'count'>) => void
  dismissBanner: (id: number) => void
  pushToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  showMilestone: (milestone: Milestone) => void
  dismissMilestone: () => void
  /** Save and apply 'system' | 'light' | 'dark'. */
  setTheme: (theme: ThemePreference) => void
  setConnected: (connected: boolean) => void
}

let nextId = 1

export const createSessionSlice: Slice<SessionSlice> = (set, get) => ({
  ready: false,
  onboarded: false,
  me: null,
  settings: null,
  badges: { notifications: 0, messages: 0 },
  banners: [],
  toasts: [],
  milestone: null,
  theme: loadThemePreference(),
  connected: false,

  setSession: (session) => {
    set({ ready: true, onboarded: session.onboarded, me: session.me, settings: session.settings, badges: session.badges })
    if (session.me) get().upsertAccounts([session.me])
  },
  setMe: (me) => {
    set({ me })
    // My avatar and name are also inside cached posts and comments; the account cache updates them everywhere.
    get().upsertAccounts([me])
  },
  applyMeStats: ({ followers, following, postCount, aura, verified, tier }) => {
    const { me, settings } = get()
    if (!me) return
    const next = { ...me, followers, following, postCount, aura, verified: verified ?? me.verified, tier: tier ?? me.tier }
    if (verified === undefined && tier === undefined) {
      set({ me: next })
      return
    }
    // A tier change: setMe also refreshes my verified badge on cached posts and comments.
    get().setMe(next)
    if (tier && settings) set({ settings: { ...settings, tier } })
  },
  setSettings: (settings) => set({ settings }),
  setBadges: (badges) => set({ badges }),

  pushBanner: (banner) => {
    if (banner.href && banner.href === window.location.pathname) return
    const conversationId = banner.href?.match(/^\/messages\/([^/]+)$/)?.[1]
    if (conversationId && get().conversations[conversationId]?.muted) return
    // Another message from the same chat updates that chat's banner ("2 new") instead of stacking a second one.
    const same = banner.href ? get().banners.find((b) => b.href === banner.href) : undefined
    const next: Banner = { ...banner, id: same?.id ?? nextId++, count: (same?.count ?? 0) + 1 }
    // Newest on top; at most three on screen (one on phones) so a busy group chat never buries the screen.
    const max = window.matchMedia(MOBILE_QUERY).matches ? 1 : 3
    set((s) => ({ banners: [next, ...s.banners.filter((b) => b.id !== next.id)].slice(0, max) }))
  },
  dismissBanner: (id) => set((s) => ({ banners: s.banners.filter((b) => b.id !== id) })),
  pushToast: (toast) => set((s) => ({ toasts: [...s.toasts, { ...toast, id: nextId++ }].slice(-3) })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  showMilestone: (milestone) => set({ milestone }),
  dismissMilestone: () => set({ milestone: null }),
  setTheme: (theme) => {
    saveThemePreference(theme)
    applyTheme(theme)
    set({ theme })
  },
  setConnected: (connected) => set({ connected }),
})
