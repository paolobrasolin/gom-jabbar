import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './db'
import { addEntry, makeEntry, logUpdate } from './entries'
import { emptyDraft } from './draft'
import { LEG_IDS } from './regions'
import { presetFromDraft, addPreset, deletePreset, restorePreset, logPreset, lastForPreset, lastByPreset, presetEntries } from './presets'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
})

const L = (regions: string[], readings: Record<string, number>, tags: string[] = []) => ({ regions, readings, tags })

describe('presets', () => {
  it('captures a draft as a preset: its layers, pain first then every symptom above 0 on any layer, the kind', () => {
    const d = emptyDraft({ kind: 'episode' })
    d.layers = [L(['153', '152'], { pain: 6, swelling: 3, fatigue: 0 }, ['compression']), L(['mind'], { fog: 2 }), L([], { pain: 3 })]
    expect(presetFromDraft(d, '  Gambe ')).toEqual({
      name: 'Gambe',
      layers: [L(['152', '153'], { pain: 6, swelling: 3, fatigue: 0 }, ['compression']), L(['mind'], { fog: 2 })],
      symptomIds: ['pain', 'swelling', 'fog'],
      kind: 'episode',
    })
    // Only the mind: no pain slider.
    const m = emptyDraft()
    m.layers = [L(['mind'], { pain: 5, fog: 6 })]
    expect(presetFromDraft(m, 'Testa').symptomIds).toEqual(['fog'])
  })

  it('adds in order, deletes and restores', async () => {
    const a = await addPreset({ name: 'Schiena', layers: [L(['224'], { pain: 5 })], symptomIds: ['pain'], kind: 'chronic' })
    const b = await addPreset({ name: 'Gambe', layers: [], symptomIds: ['pain', 'swelling'], kind: 'chronic' })
    expect(a.order).toBe(0)
    expect(b.order).toBe(1)
    const gone = await deletePreset(a.id)
    expect(gone?.name).toBe('Schiena')
    expect((await db.presets.toArray()).map((p) => p.id)).toEqual([b.id])
    await restorePreset(gone!)
    expect(await db.presets.count()).toBe(2)
  })

  it('logs a chronic snapshot from a preset, each layer taking the readings it shows, and finds the last one', async () => {
    const p = await addPreset({ name: 'Gambe', layers: [L(LEG_IDS, { pain: 9 }, ['compression']), L(['mind'], {})], symptomIds: ['pain', 'swelling', 'fog'], kind: 'chronic' })
    expect(await lastForPreset(p.id)).toBeUndefined()
    const e1 = await logPreset(p, { pain: 4, swelling: 6, fog: 2 }, '2026-09-01T10:00:00.000Z')
    expect(e1).toMatchObject({ presetId: p.id, kind: 'chronic', note: '' })
    expect(e1).not.toHaveProperty('endedAt')
    expect(e1.layers).toEqual([L([...LEG_IDS].sort(), { pain: 4, swelling: 6 }, ['compression']), L(['mind'], { fog: 2 })])
    const e2 = await logPreset(p, { pain: 2 }, '2026-09-03T10:00:00.000Z')
    await addEntry({ readings: { pain: 9 }, at: '2026-09-05T10:00:00.000Z' })
    expect((await lastForPreset(p.id))?.id).toBe(e2.id)
  })

  it('an episode preset opens an episode, and its updates count as its samples', async () => {
    const p = await addPreset({ name: 'Testa', layers: [L(['100', '101'], { pain: 5 })], symptomIds: ['pain'], kind: 'episode' })
    const head = await logPreset(p, { pain: 6 }, '2026-09-01T10:00:00.000Z')
    expect(head).toMatchObject({ kind: 'episode', episodeId: head.id, endedAt: null, presetId: p.id })
    const u = await logUpdate(head.id, [{ pain: 2 }], '2026-09-01T12:00:00.000Z')
    expect(u).not.toHaveProperty('presetId')
    expect((await presetEntries()).map((e) => e.id).sort()).toEqual([head.id, u!.id].sort())
    expect((await lastForPreset(p.id))?.id).toBe(u!.id)
  })
})

describe('preset edge cases', () => {
  it('ignores unknown ids and finds the newest entry per preset', async () => {
    expect(await deletePreset('nope')).toBeUndefined()
    const mk = (at: string, presetId?: string) => makeEntry({ at, readings: { pain: 1 }, presetId })
    const older = mk('2026-09-01T00:00:00.000Z', 'a')
    const newer = mk('2026-09-02T00:00:00.000Z', 'a')
    const other = mk('2026-09-03T00:00:00.000Z')
    expect(lastByPreset([newer, older, other])).toEqual({ a: newer })
    expect(lastByPreset([older, newer])).toEqual({ a: newer })
    // An update inherits its head's preset; one whose head is not at hand counts for nothing.
    const head = makeEntry({ at: '2026-09-04T00:00:00.000Z', kind: 'episode', readings: { pain: 5 }, presetId: 'a' })
    const upd = { ...makeEntry({ at: '2026-09-05T00:00:00.000Z', kind: 'episode', readings: { pain: 2 } }), episodeId: head.id }
    expect(lastByPreset([newer, head, upd])).toEqual({ a: upd })
    expect(lastByPreset([newer, upd])).toEqual({ a: newer })
  })

  it('a body layer records pain 0 when the preset does not track pain', async () => {
    const p = await addPreset({ name: 'Gonfiore', layers: [L(['160'], { pain: 3 })], symptomIds: ['swelling'], kind: 'chronic' })
    const e = await logPreset(p, { swelling: 4 })
    expect(e.layers).toEqual([L(['160'], { swelling: 4, pain: 0 })])
  })
})
