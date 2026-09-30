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

/**
 * A counted message (§9): `key.one` where the app's language puts `n` in the singular (Intl.PluralRules: 1 in Italian and
 * English, not 0), else `key`; `{n}` as the language writes it.
 */
export function tn(key: string, n: number, params?: Record<string, string | number>): string {
  const form = `${key}.${new Intl.PluralRules(locale()).select(n)}`
  return t(form in messages[prefs.lang] ? form : key, { ...params, n: num(n) })
}

/** A figure as the app's language writes it, to one decimal: "2,5" in Italian, "2.5" in English. `fixed` keeps a ".0". */
export function num(v: number, fixed = false): string {
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: fixed ? 1 : 0, maximumFractionDigits: 1 }).format(v)
}

export { messages }
