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
    const e = makeEntry({ areas: [{ regions: ['thigh.l'], intensity: 7 }], tags: ['rest'], readings: { pain: 7, swelling: 2 }, note: 'x' })
    const d = draftFromEntry(e)
    d.areas[0].regions.push('thigh.r')
    d.tags.push('heat')
    expect(e.areas[0].regions).toEqual(['thigh.l'])
    expect(e.tags).toEqual(['rest'])
    expect(d.readings).toEqual({ pain: 7, swelling: 2 })
  })

  it('draftToInput resolves "now", trims the note and copies the rest', () => {
    const d = emptyDraft()
    d.note = '  dopo la corsa  '
    d.areas = [{ regions: ['thigh.l'], intensity: 5 }]
    const before = Date.now()
    const input = draftToInput(d)
    expect(Date.parse(input.at!)).toBeGreaterThanOrEqual(before)
    expect(input.note).toBe('dopo la corsa')
    expect(input.areas).toEqual(d.areas)
    expect(input.areas).not.toBe(d.areas)
  })
})
