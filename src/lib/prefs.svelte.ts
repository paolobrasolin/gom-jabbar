import type { Lang } from './types'
import type { FigureId } from './figures'

export type Theme = 'system' | 'light' | 'dark'
export type Tab = 'log' | 'diary' | 'trends' | 'settings'

type Prefs = {
  lang: Lang
  theme: Theme
  mirror: boolean
  /** Which of the two CHOIR silhouettes the body map draws (§5.3). */
  figure: FigureId
  ongoing: boolean
  lastBackupAt: string | null
  backupSnoozedUntil: string | null
  /** First launch as an installed app; set once, hides the install nudge for good. */
  installedAt: string | null
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
    figure: 'female',
    ongoing: false,
    lastBackupAt: null,
    backupSnoozedUntil: null,
    installedAt: null,
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
