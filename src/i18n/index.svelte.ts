import it from './it.json'
import en from './en.json'
import { prefs } from '../lib/prefs.svelte'
import type { Lang, LocalizedString } from '../lib/types'

const messages: Record<Lang, Record<string, string>> = { it, en }

export function t(key: string, params?: Record<string, string | number>): string {
  const lang = prefs.lang
  let s = messages[lang][key] ?? messages.it[key] ?? key
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

export function tl(label: LocalizedString): string {
  return label[prefs.lang] || label.it || label.en
}

export function locale(): string {
  return prefs.lang === 'en' ? 'en-GB' : 'it-IT'
}

export { messages }
