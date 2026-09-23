import type { Lang } from './types'
import type { FigureId } from './figures'

export type Theme = 'system' | 'light' | 'dark'
export type Tab = 'log' | 'diary' | 'trends' | 'settings'

type Prefs = {
  lang: Lang
  theme: Theme
  /** A tap takes the other side along (§5.3). */
  mirror: boolean
  /** A tap takes the other view along (#22). */
  mirrorViews: boolean
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
    mirror: false,
    mirrorViews: true,
    figure: 'female',
    ongoing: false,
    lastBackupAt: null,
    backupSnoozedUntil: null,
    installedAt: null,
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaults
    const stored = JSON.parse(raw) as Partial<Prefs>
    // Before #22 the sides mirror was on by default, so a store without the views mirror holds a default, not a choice: it starts off like a fresh install.
    if (!('mirrorViews' in stored)) delete stored.mirror
    return { ...defaults, ...stored }
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
