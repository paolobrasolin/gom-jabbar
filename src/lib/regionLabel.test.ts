import { describe, it, expect } from 'vitest'
import { regionLabel } from './regionLabel'
import { REGIONS } from './regions'
import { t } from '../i18n/index.svelte'
import { prefs } from '../lib/prefs.svelte'
import it_ from '../i18n/it.json'

describe('regionLabel', () => {
  it('names every region in both languages', () => {
    prefs.lang = 'it'
    expect(regionLabel('thigh.l', t)).toBe('Coscia sx')
    expect(regionLabel('chest', t)).toBe('Petto')
    for (const r of REGIONS) expect(regionLabel(r.id, t)).not.toMatch(/^reg\./)
    prefs.lang = 'en'
    expect(regionLabel('calf.r', t)).toBe('Right Calf')
    for (const r of REGIONS) expect(regionLabel(r.id, t)).not.toMatch(/^reg\./)
    prefs.lang = 'it'
    const bases = new Set(REGIONS.map((r) => (r.side ? r.id.slice(0, -2) : r.id)))
    for (const b of bases) expect((it_ as Record<string, string>)[`reg.${b}`], b).toBeTruthy()
  })
})
