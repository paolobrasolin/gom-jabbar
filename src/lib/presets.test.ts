import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './db'
import { addEntry, makeEntry } from './entries'
import { emptyDraft } from './draft'
import { LEG_IDS } from './regions'
import { presetFromDraft, addPreset, deletePreset, restorePreset, logPreset, lastForPreset } from './presets'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
})

const L = (regions: string[], readings: Record<string, number>, tags: string[] = []) => ({ regions, readings, tags })

describe('presets', () => {
  it('captures a draft as a preset: its layers, pain first then every symptom above 0 on any layer, the episode flag', () => {
    const d = emptyDraft({ ongoing: true })
    d.layers = [L(['153', '152'], { pain: 6, swelling: 3, fatigue: 0 }, ['compression']), L(['mind'], { fog: 2 }), L([], { pain: 3 })]
    expect(presetFromDraft(d, '  Gambe ')).toEqual({
      name: 'Gambe',
      layers: [L(['152', '153'], { pain: 6, swelling: 3, fatigue: 0 }, ['compression']), L(['mind'], { fog: 2 })],
      symptomIds: ['pain', 'swelling', 'fog'],
      ongoing: true,
    })
    // Only the mind: no pain slider.
    const m = emptyDraft()
    m.layers = [L(['mind'], { pain: 5, fog: 6 })]
    expect(presetFromDraft(m, 'Testa').symptomIds).toEqual(['fog'])
  })

  it('adds in order, deletes and restores', async () => {
    const a = await addPreset({ name: 'Schiena', layers: [L(['224'], { pain: 5 })], symptomIds: ['pain'], ongoing: false })
    const b = await addPreset({ name: 'Gambe', layers: [], symptomIds: ['pain', 'swelling'], ongoing: false })
    expect(a.order).toBe(0)
    expect(b.order).toBe(1)
    const gone = await deletePreset(a.id)
    expect(gone?.name).toBe('Schiena')
    expect((await db.presets.toArray()).map((p) => p.id)).toEqual([b.id])
    await restorePreset(gone!)
    expect(await db.presets.count()).toBe(2)
  })

  it('logs an ordinary moment from a preset, each layer taking the readings it shows, and finds the last one', async () => {
    const p = await addPreset({ name: 'Gambe', layers: [L(LEG_IDS, { pain: 9 }, ['compression']), L(['mind'], {})], symptomIds: ['pain', 'swelling', 'fog'], ongoing: false })
    expect(await lastForPreset(p.id)).toBeUndefined()
    const e1 = await logPreset(p, { pain: 4, swelling: 6, fog: 2 }, '2026-09-01T10:00:00.000Z')
    expect(e1).toMatchObject({ preset: p.id, ongoing: false, note: '' })
    expect(e1.layers).toEqual([L([...LEG_IDS].sort(), { pain: 4, swelling: 6 }, ['compression']), L(['mind'], { fog: 2 })])
    const e2 = await logPreset(p, { pain: 2 }, '2026-09-03T10:00:00.000Z')
    await addEntry({ readings: { pain: 9 }, at: '2026-09-05T10:00:00.000Z' })
    expect((await lastForPreset(p.id))?.id).toBe(e2.id)
  })
})

describe('preset edge cases', () => {
  it('ignores unknown ids and finds the newest entry per preset', async () => {
    expect(await deletePreset('nope')).toBeUndefined()
    const { lastByPreset } = await import('./presets')
    const mk = (at: string, preset?: string) => ({ ...makeEntry({ at, readings: { pain: 1 } }), ...(preset ? { preset } : {}) })
    const older = mk('2026-09-01T00:00:00.000Z', 'a')
    const newer = mk('2026-09-02T00:00:00.000Z', 'a')
    const other = mk('2026-09-03T00:00:00.000Z')
    expect(lastByPreset([newer, older, other])).toEqual({ a: newer })
    expect(lastByPreset([older, newer])).toEqual({ a: newer })
  })

  it('a body layer records pain 0 when the preset does not track pain', async () => {
    const p = await addPreset({ name: 'Gonfiore', layers: [L(['160'], { pain: 3 })], symptomIds: ['swelling'], ongoing: false })
    const e = await logPreset(p, { swelling: 4 })
    expect(e.layers).toEqual([L(['160'], { swelling: 4, pain: 0 })])
  })
})
