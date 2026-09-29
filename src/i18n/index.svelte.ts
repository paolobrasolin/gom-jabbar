import it from './it.json'
import en from './en.json'
import { prefs } from '../lib/prefs.svelte'
import { I18N } from '../lib/vocabulary'
import type { Lang, Label } from '../lib/types'

const messages: Record<Lang, Record<string, string>> = { it, en }

export function t(key: string, params?: Record<string, string | number>): string {
  const lang = prefs.lang
  let s = messages[lang][key] ?? messages.it[key] ?? key
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** A symptom's or tag's name (§5.2): a dictionary key in the app's language (bare when unknown), anything else as typed. */
export function tl(label: Label): string {
  return label.startsWith(I18N) ? t(label.slice(I18N.length)) : label
}

export function locale(): string {
  return prefs.lang === 'en' ? 'en-GB' : 'it-IT'
}

export { messages }
