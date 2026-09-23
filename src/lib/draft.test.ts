import { describe, it, expect } from 'vitest'
import { emptyDraft, draftFromEntry, draftToInput } from './draft'
import { makeEntry } from './entries'

describe('draft conversions', () => {
  it('a fresh draft is "now", one layer without regions at pain 5', () => {
    const d = emptyDraft()
    expect(d).toEqual({ at: null, kind: 'chronic', endedAt: null, layers: [{ regions: [], readings: { pain: 5 }, tags: [] }], cur: 0, note: '' })
    expect(emptyDraft({ kind: 'episode', pain: 2 })).toMatchObject({ kind: 'episode', endedAt: null, layers: [{ readings: { pain: 2 } }] })
  })

  it('draftFromEntry copies layers so edits do not touch the entry, and always has a layer', () => {
    const e = makeEntry({ layers: [{ regions: ['152'], readings: { pain: 7, swelling: 2 }, tags: ['rest'] }], note: 'x' })
    const d = draftFromEntry(e)
    d.layers[0].regions.push('153')
    d.layers[0].tags.push('heat')
    d.layers[0].readings.pain = 1
    expect(e.layers[0]).toEqual({ regions: ['152'], readings: { pain: 7, swelling: 2 }, tags: ['rest'] })
    expect(d.layers[0].readings).toEqual({ pain: 1, swelling: 2 })
    expect(draftFromEntry({ ...e, layers: [] }).layers).toEqual([{ regions: [], readings: { pain: 0 }, tags: [] }])
  })

  it('draftToInput resolves "now", trims the note and copies the rest', () => {
    const d = emptyDraft()
    d.note = '  dopo la corsa  '
    d.layers = [{ regions: ['152'], readings: { pain: 5 }, tags: [] }]
    const before = Date.now()
    const input = draftToInput(d)
    expect(Date.parse(input.at!)).toBeGreaterThanOrEqual(before)
    expect(input.note).toBe('dopo la corsa')
    expect(input.layers).toEqual(d.layers)
    expect(input.layers).not.toBe(d.layers)
  })

  it('an episode with an end round-trips: the draft holds both bounds, the input says which kind and when it ended', () => {
    const e = { ...makeEntry({ at: '2026-09-01T10:00:00.000Z', kind: 'episode' }), endedAt: '2026-09-01T12:00:00.000Z' }
    const d = draftFromEntry(e)
    expect(d).toMatchObject({ at: e.at, kind: 'episode', endedAt: e.endedAt })
    expect(draftToInput(d)).toMatchObject({ at: e.at, kind: 'episode', endedAt: e.endedAt })
    // An active one has no end yet; a chronic snapshot has neither.
    expect(draftFromEntry(makeEntry({ kind: 'episode' }))).toMatchObject({ kind: 'episode', endedAt: null })
    expect(draftToInput(draftFromEntry(makeEntry({ kind: 'episode' })))).toMatchObject({ kind: 'episode', endedAt: null })
    expect(draftFromEntry(makeEntry({}))).toMatchObject({ kind: 'chronic', endedAt: null })
    expect(draftToInput(draftFromEntry(makeEntry({})))).toMatchObject({ kind: 'chronic', endedAt: null })
    // Cronico drops the end: an end on a chronic draft means nothing.
    d.kind = 'chronic'
    expect(draftToInput(d)).toMatchObject({ kind: 'chronic', endedAt: null })
  })
})

describe('strokes in drafts', () => {
  it('the preset an entry was logged from rides along, and a draft without one saves none', () => {
    const e = makeEntry({ readings: { pain: 3 }, presetId: 'p1' })
    const d = draftFromEntry(e)
    expect(d.presetId).toBe('p1')
    expect(draftToInput(d).presetId).toBe('p1')
    expect(draftFromEntry(makeEntry({ readings: { pain: 3 } }))).not.toHaveProperty('presetId')
    expect(draftToInput(emptyDraft())).not.toHaveProperty('presetId')
  })

  it('draftFromEntry and draftToInput copy strokes so edits do not touch the entry', () => {
    const stroke = { region: '152', fig: 'female' as const, view: 'front' as const, points: [[100, 250]] as [number, number][], w: 8 }
    const e = makeEntry({ layers: [{ regions: ['152'], readings: { pain: 7 }, strokes: [stroke] }] })
    const d = draftFromEntry(e)
    d.layers[0].strokes![0].points.push([1, 2])
    d.layers[0].strokes!.push({ region: '261', fig: 'female', view: 'back', points: [[1, 2]], w: 8 })
    expect(e.layers[0].strokes).toEqual([stroke])
    const input = draftToInput(d)
    expect(input.layers![0].strokes).toHaveLength(2)
    expect(input.layers![0].strokes).not.toBe(d.layers[0].strokes)
    expect(draftFromEntry(makeEntry({ layers: [{ regions: ['110'], readings: { pain: 1 } }] })).layers[0]).not.toHaveProperty('strokes')
  })
})
