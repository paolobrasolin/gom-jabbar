import { describe, it, expect, beforeEach } from 'vitest'
import { loadDraft, storeDraft, DRAFT_KEY, DRAFT_SCHEMA, DRAFT_TTL, pruneUnknown } from './logDraft'
import { emptyDraft } from './draft'
import { resetDb } from './db'
import { addTag, addSymptom } from './vocab'
import { addPreset } from './presets'

beforeEach(() => localStorage.removeItem(DRAFT_KEY))

const sample = () => {
  const d = { ...emptyDraft(), note: 'dopo la corsa', at: '2026-09-30T08:00:00.000Z' }
  d.layers[0] = { regions: ['152'], readings: { pain: 7 }, tags: ['rest'] }
  return d
}

describe('the log draft outlives the log', () => {
  it('round-trips a draft through storage', () => {
    storeDraft(sample(), 1000)
    expect(loadDraft(1000 + 60_000)).toEqual(sample())
  })

  it('drops a draft older than its time to live, so a stale one does not come back a day later', () => {
    storeDraft(sample(), 1000)
    expect(loadDraft(1000 + DRAFT_TTL + 1)).toBeNull()
  })

  it('drops a draft of another shape, another database version, or garbage, rather than guess', () => {
    const base = { schema: DRAFT_SCHEMA, verno: 10, savedAt: 1000, draft: sample() }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...base, schema: DRAFT_SCHEMA + 1 }))
    expect(loadDraft(2000)).toBeNull()
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...base, verno: 1 }))
    expect(loadDraft(2000)).toBeNull()
    localStorage.setItem(DRAFT_KEY, '{nope')
    expect(loadDraft(2000)).toBeNull()
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...base, draft: { layers: 'x' } }))
    expect(loadDraft(2000)).toBeNull()
  })

  it('at save, drops what the vocabulary or the presets no longer have: a tag, a symptom or a preset deleted meanwhile', async () => {
    resetDb()
    const tag = await addTag('Ibuprofene', 'medication')
    const sym = await addSymptom('Crampi')
    const preset = await addPreset({ name: 'Gambe', layers: [{ regions: ['152'], asks: ['pain'] }], kind: 'chronic' })
    const input = {
      at: '2026-09-30T08:00:00.000Z',
      kind: 'chronic' as const,
      endedAt: null,
      note: '',
      presetId: 'gone',
      layers: [{ regions: ['152'], readings: { pain: 4, [sym.id]: 2, vanished: 3 }, tags: ['rest', tag.id, 'deleted-tag'] }],
    }
    expect(await pruneUnknown(input)).toEqual({ ...input, presetId: undefined, layers: [{ regions: ['152'], readings: { pain: 4, [sym.id]: 2 }, tags: ['rest', tag.id] }] })
    expect((await pruneUnknown({ ...input, presetId: preset.id })).presetId).toBe(preset.id)
  })
})
