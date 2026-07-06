export const THEME_STORAGE_KEY = 'minidamo:theme'

export const THEMES = ['arcade', 'mono'] as const
export type ThemeName = (typeof THEMES)[number]

export const DEFAULT_THEME: ThemeName = 'arcade'

export function isThemeName(v: string | null): v is ThemeName {
  return v !== null && (THEMES as readonly string[]).includes(v)
}

export function readStoredTheme(): ThemeName {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeName(raw)) return raw
  } catch {
    // localStorage unavailable — fall through
  }
  return DEFAULT_THEME
}

export function persistTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

export function applyThemeToDocument(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}
