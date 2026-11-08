/**
 * Light / dark theme.
 *
 * The person's choice ('system' | 'light' | 'dark') is saved in localStorage. The theme actually
 * shown is a `dark` class on <html>, which flips the color variables in styles.css.
 * index.html runs the same check before the first paint, so dark-mode users never see a white flash.
 */
export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'aura-theme'

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function loadThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage can be blocked (private mode); following the system is a fine fallback.
  }
  return 'system'
}

export function saveThemePreference(theme: ThemePreference): void {
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Not saved, but the theme still applies for this visit.
  }
}

/** Put the `dark` class on <html> (or take it off) and match the browser's toolbar color. */
export function applyTheme(theme: ThemePreference): void {
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B0B0F' : '#FFFFFF')
}

/** Call `onChange` when the operating system switches between light and dark. Returns an unsubscribe function. */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
