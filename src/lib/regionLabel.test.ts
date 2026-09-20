import { describe, it, expect } from 'vitest'
import { regionLabel } from './regionLabel'
import { REGIONS, MIND } from './regions'
import { t } from '../i18n/index.svelte'
import { prefs } from '../lib/prefs.svelte'
import it_ from '../i18n/it.json'

describe('regionLabel', () => {
  it('names every region in both languages, with its side', () => {
    prefs.lang = 'it'
    expect(regionLabel('152', t)).toBe('Coscia sx')
    expect(regionLabel('110', t)).toBe('Petto sx')
    expect(regionLabel('227', t)).toBe('Gluteo dx')
    expect(regionLabel(MIND, t)).toBe('Mente')
    for (const r of REGIONS) expect(regionLabel(r.id, t)).not.toMatch(/^reg\./)
    prefs.lang = 'en'
    expect(regionLabel('261', t)).toBe('Right Calf')
    expect(regionLabel(MIND, t)).toBe('Mind')
    for (const r of REGIONS) expect(regionLabel(r.id, t)).not.toMatch(/^reg\./)
    prefs.lang = 'it'
    for (const r of REGIONS) expect((it_ as Record<string, string>)[`reg.${r.name}`], r.name).toBeTruthy()
  })
})
