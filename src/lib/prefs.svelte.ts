import type { Lang } from './types'

export type Theme = 'system' | 'light' | 'dark'
export type Tab = 'log' | 'diary' | 'trends' | 'settings'

type Prefs = {
  lang: Lang
  theme: Theme
  mirror: boolean
  ongoing: boolean
  lastBackupAt: string | null
  backupSnoozedUntil: string | null
  /** First launch as an installed app; set once, hides the install nudge for good. */
  installedAt: string | null
  /** The one hint line on the log screen was dismissed. */
  hintDismissed: boolean
}

const KEY = 'gj.prefs'

function detectLang(): Lang {
  const l = (typeof navigator !== 'undefined' ? navigator.language : 'it').toLowerCase()
  return l.startsWith('en') ? 'en' : 'it'
}

function load(): Prefs {
  const defaults: Prefs = {
    lang: detectLang(),
    theme: 'system',
    mirror: true,
    ongoing: false,
    lastBackupAt: null,
    backupSnoozedUntil: null,
    installedAt: null,
    hintDismissed: false,
  }
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults
  } catch {
    return defaults
  }
}

export const prefs = $state<Prefs>(load())

export function savePrefs() {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable: preferences just don't persist */
  }
}
