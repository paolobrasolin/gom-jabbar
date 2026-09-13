import { describe, it, expect } from 'vitest'
import it_ from './it.json'
import en from './en.json'
import { t } from './index.svelte'
import { prefs } from '../lib/prefs.svelte'

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
})
