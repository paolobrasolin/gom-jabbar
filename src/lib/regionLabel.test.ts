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
    expect(regionLabel('244', t)).toBe('Mano sx')
    expect(regionLabel('254', t)).toBe('Dietro il ginocchio sx')
    expect(regionLabel('202', t)).toBe('Nuca sx')
    expect(regionLabel(MIND, t)).toBe('Mente')
    expect(regionLabel('nope', t)).toBe('nope')
    for (const r of REGIONS) expect(regionLabel(r.id, t)).not.toMatch(/^part\./)
    prefs.lang = 'en'
    expect(regionLabel('261', t)).toBe('Right calf')
    expect(regionLabel('255', t)).toBe('Back of right knee')
    expect(regionLabel('105', t)).toBe('Right neck')
    expect(regionLabel(MIND, t)).toBe('Mind')
    for (const r of REGIONS) expect(regionLabel(r.id, t)).not.toMatch(/^part\.|\(back\)/)
    prefs.lang = 'it'
    // The back view repeats no front name with a suffix (#33).
    for (const r of REGIONS) expect(regionLabel(r.id, t)).not.toMatch(/^part\.|\(dietro\)/)
    expect((it_ as Record<string, string>)['part.hand.l']).toBeTruthy()
  })
})
