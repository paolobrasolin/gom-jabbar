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

describe('presets', () => {
  it('captures a draft as a preset: areas, symptoms above 0 (pain always first), tags, episode flag', () => {
    const d = emptyDraft({ ongoing: true })
    d.areas = [{ regions: ['153', '152'], intensity: 6 }, { regions: [], intensity: 3 }]
    d.readings = { pain: 6, swelling: 3, fatigue: 0 }
    d.tags = ['compression']
    expect(presetFromDraft(d, '  Gambe ')).toEqual({
      name: 'Gambe',
      areas: [{ regions: ['152', '153'], intensity: 6 }],
      symptomIds: ['pain', 'swelling'],
      tags: ['compression'],
      ongoing: true,
    })
  })

  it('adds in order, deletes and restores', async () => {
    const a = await addPreset({ name: 'Schiena', areas: [{ regions: ['224'], intensity: 5 }], symptomIds: ['pain'], tags: [], ongoing: false })
    const b = await addPreset({ name: 'Gambe', areas: [], symptomIds: ['pain', 'swelling'], tags: [], ongoing: false })
    expect(a.order).toBe(0)
    expect(b.order).toBe(1)
    const gone = await deletePreset(a.id)
    expect(gone?.name).toBe('Schiena')
    expect((await db.presets.toArray()).map((p) => p.id)).toEqual([b.id])
    await restorePreset(gone!)
    expect(await db.presets.count()).toBe(2)
  })

  it('logs an ordinary moment from a preset and finds the last one', async () => {
    const p = await addPreset({ name: 'Gambe', areas: [{ regions: LEG_IDS, intensity: 9 }], symptomIds: ['pain', 'swelling'], tags: ['compression'], ongoing: false })
    expect(await lastForPreset(p.id)).toBeUndefined()
    const e1 = await logPreset(p, { pain: 4, swelling: 6 }, '2026-09-01T10:00:00.000Z')
    expect(e1).toMatchObject({ preset: p.id, ongoing: false, tags: ['compression'], readings: { pain: 4, swelling: 6 }, note: '' })
    expect(e1.areas).toEqual([{ regions: [...LEG_IDS].sort(), intensity: 4 }])
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

  it('a mind-only draft becomes a preset without pain, and logging it levels the mind by the mental readings', async () => {
    const d = emptyDraft()
    d.areas = [{ regions: ['mind'], intensity: 6 }]
    d.readings = { pain: 5, fog: 6 }
    const input = presetFromDraft(d, 'Testa')
    expect(input.symptomIds).toEqual(['fog'])
    const p = await addPreset(input)
    const e = await logPreset(p, { fog: 4 })
    expect(e.areas).toEqual([{ regions: ['mind'], intensity: 4 }])
    expect(e.readings).toEqual({ fog: 4, pain: 0 })
    // Mind beside a body area: pain stays, the mind takes the mental level.
    const mixed = await addPreset({ name: 'Tutto', areas: [{ regions: ['*'], intensity: 5 }, { regions: ['mind'], intensity: 5 }], symptomIds: ['pain', 'fog'], tags: [], ongoing: false })
    const m = await logPreset(mixed, { pain: 3, fog: 7 })
    expect(m.areas).toEqual([{ regions: ['*'], intensity: 3 }, { regions: ['mind'], intensity: 7 }])
  })

  it('logs areas at 0 when the preset does not track pain', async () => {
    const p = await addPreset({ name: 'Gonfiore', areas: [{ regions: ['160'], intensity: 3 }], symptomIds: ['swelling'], tags: [], ongoing: false })
    const e = await logPreset(p, { swelling: 4 })
    expect(e.areas).toEqual([{ regions: ['160'], intensity: 0 }])
    expect(e.readings).toEqual({ swelling: 4, pain: 0 })
  })
})
