import { describe, it, expect } from 'vitest'
import it_ from './it.json'
import en from './en.json'
import { t, tl, num, tn } from './index.svelte'
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
  it("writes a figure as the app's language does: a decimal comma in Italian, a point in English", () => {
    prefs.lang = 'it'
    expect([num(2.5), num(6), num(6, true), num(4.75), num(1234)]).toEqual(['2,5', '6', '6,0', '4,8', '1234'])
    prefs.lang = 'en'
    expect([num(2.5), num(6), num(6, true), num(4.75)]).toEqual(['2.5', '6', '6.0', '4.8'])
  })
  it("counts in the app's language: the singular for one, the plural for the rest, zero included", () => {
    prefs.lang = 'it'
    expect([0, 1, 2, 12].map((n) => tn('trends.onDays', n))).toEqual(['in 0 giorni', 'in 1 giorno', 'in 2 giorni', 'in 12 giorni'])
    expect(tn('import.summary', 1, { d: '10 set' })).toBe('1 voce nel file del 10 set.')
    expect(tn('vocab.presets', 1)).toBe('1 preset')
    prefs.lang = 'en'
    expect([0, 1, 2].map((n) => tn('trends.onDays', n))).toEqual(['on 0 days', 'on 1 day', 'on 2 days'])
    expect(tn('vocab.presets', 1)).toBe('1 preset')
    expect(tn('vocab.presets', 2)).toBe('2 presets')
  })
  it('has a singular for every counted message, in both languages', () => {
    for (const m of [it_, en] as Record<string, string>[]) for (const k of Object.keys(m).filter((k) => k.endsWith('.one'))) expect(m, k).toHaveProperty([k.slice(0, -4)])
  })
  it('names the seed in plain words: a feeling, not a diagnosis; nobody gendered', () => {
    prefs.lang = 'it'
    expect(['depression', 'sitting', 'standing', 'tenderness'].map((id) => tl(`i18n:vocab.${id}`))).toEqual(['Umore basso', 'A lungo a sedere', 'A lungo in piedi', 'Male al tocco'])
    // A remedy and the weather never share a word alone: "Freddo" next to "Caldo" read as weather.
    expect(['heat', 'cold', 'hot_weather'].map((id) => tl(`i18n:vocab.${id}`))).toEqual(['Impacco caldo', 'Impacco freddo', 'Clima caldo'])
    prefs.lang = 'en'
    expect(['depression', 'sitting', 'standing', 'tenderness'].map((id) => tl(`i18n:vocab.${id}`))).toEqual(['Low mood', 'Sitting for long', 'Standing for long', 'Sore to the touch'])
    expect(['heat', 'cold', 'hot_weather'].map((id) => tl(`i18n:vocab.${id}`))).toEqual(['Warm pack', 'Cold pack', 'Hot weather'])
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
