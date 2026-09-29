import { describe, it, expect } from 'vitest'
import it_ from './it.json'
import en from './en.json'
import { t, tl } from './index.svelte'
import { prefs } from '../lib/prefs.svelte'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from '../lib/vocabulary'

describe('i18n', () => {
  it('has the same keys in every language', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(it_).sort())
  })
  it('has no empty messages', () => {
    for (const m of [it_, en]) for (const [k, v] of Object.entries(m)) expect(v, k).not.toBe('')
  })
  it('interpolates and falls back', () => {
    prefs.lang = 'it'
    expect(t('time.hoursAgo', { n: 3 })).toBe('3h fa')
    prefs.lang = 'en'
    expect(t('time.hoursAgo', { n: 3 })).toBe('3h ago')
    expect(t('nope.missing')).toBe('nope.missing')
  })
  it('has every seed label in both languages: the keys are user data, added, never renamed or removed', () => {
    for (const x of [...DEFAULT_SYMPTOMS, ...DEFAULT_TAGS]) {
      const key = x.label.replace(/^i18n:/, '')
      expect(it_, key).toHaveProperty([key])
      expect(en, key).toHaveProperty([key])
    }
  })
  it('shows a dictionary key in the current language, a typed name as typed, an unknown key bare', () => {
    prefs.lang = 'it'
    expect(tl('i18n:vocab.pain')).toBe('Dolore')
    expect(tl('i18n:vocab.badsleep')).toBe('Dormito male')
    expect(tl('Formicolio')).toBe('Formicolio')
    expect(tl('i18n:vocab.future')).toBe('vocab.future')
    prefs.lang = 'en'
    expect(tl('i18n:vocab.pain')).toBe('Pain')
    expect(tl('i18n:vocab.badsleep')).toBe('Slept badly')
    expect(tl('Formicolio')).toBe('Formicolio')
    prefs.lang = 'it'
  })
})
