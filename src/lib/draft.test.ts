import { describe, it, expect } from 'vitest'
import { emptyDraft, draftFromEntry, draftToInput } from './draft'
import { makeEntry } from './entries'

describe('draft conversions', () => {
  it('a fresh draft is "now", pain 5, no areas', () => {
    const d = emptyDraft()
    expect(d).toEqual({ at: null, ongoing: false, readings: { pain: 5 }, areas: [], cur: 0, tags: [], note: '' })
    expect(emptyDraft({ ongoing: true, pain: 2 })).toMatchObject({ ongoing: true, readings: { pain: 2 } })
  })

  it('draftFromEntry copies areas and tags so edits do not touch the entry', () => {
    const e = makeEntry({ areas: [{ regions: ['152'], intensity: 7 }], tags: ['rest'], readings: { pain: 7, swelling: 2 }, note: 'x' })
    const d = draftFromEntry(e)
    d.areas[0].regions.push('153')
    d.tags.push('heat')
    expect(e.areas[0].regions).toEqual(['152'])
    expect(e.tags).toEqual(['rest'])
    expect(d.readings).toEqual({ pain: 7, swelling: 2 })
  })

  it('draftToInput resolves "now", trims the note and copies the rest', () => {
    const d = emptyDraft()
    d.note = '  dopo la corsa  '
    d.areas = [{ regions: ['152'], intensity: 5 }]
    const before = Date.now()
    const input = draftToInput(d)
    expect(Date.parse(input.at!)).toBeGreaterThanOrEqual(before)
    expect(input.note).toBe('dopo la corsa')
    expect(input.areas).toEqual(d.areas)
    expect(input.areas).not.toBe(d.areas)
  })
})

describe('strokes in drafts', () => {
  it('draftFromEntry and draftToInput copy strokes so edits do not touch the entry', () => {
    const stroke = { region: '152', fig: 'female' as const, view: 'front' as const, points: [[100, 250]] as [number, number][], w: 8 }
    const e = makeEntry({ areas: [{ regions: ['152'], intensity: 7, strokes: [stroke] }] })
    const d = draftFromEntry(e)
    d.areas[0].strokes![0].points.push([1, 2])
    d.areas[0].strokes!.push({ region: '261', fig: 'female', view: 'back', points: [[1, 2]], w: 8 })
    expect(e.areas[0].strokes).toEqual([stroke])
    const input = draftToInput(d)
    expect(input.areas![0].strokes).toHaveLength(2)
    expect(input.areas![0].strokes).not.toBe(d.areas[0].strokes)
    expect(draftFromEntry(makeEntry({ areas: [{ regions: ['110'], intensity: 1 }] })).areas[0]).not.toHaveProperty('strokes')
  })
})
