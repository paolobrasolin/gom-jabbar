import { describe, it, expect } from 'vitest'
import { makeEntry } from './entries'
import { dailySeries, summarize, regionHeat, tagComparison, symptomMeans, symptomsRead, rangeStart, inRange, tagCounts, ringWidth, ringStyle } from './stats'
import { DEFAULT_TAGS, DEFAULT_SYMPTOMS } from './vocabulary'
import { presetSeries } from './stats'
import type { Preset } from './types'

const at = (d: string, h = 12) => new Date(2026, 2, Number(d), h).toISOString() // March 2026, local time
const e = (day: string, pain: number, extra: Parameters<typeof makeEntry>[0] = {}) =>
  makeEntry({ at: at(day), ...(extra.layers ? extra : { readings: { pain, ...(extra.readings ?? {}) }, ...extra }) })
const L = (regions: string[], readings: Record<string, number>) => ({ regions, readings })

describe('stats', () => {
  it('builds a daily series with gaps', () => {
    const from = new Date(2026, 2, 1)
    const s = dailySeries([e('1', 3), e('1', 7), e('3', 5)], from, 4)
    expect(s.map((p) => p.max)).toEqual([7, null, 5, null])
    expect(s[0].mean).toBe(5)
    expect(s[0].count).toBe(2)
    expect(s[3].day).toBe('2026-03-04')
  })

  it('summarizes entries and episodes', () => {
    const now = Date.parse(at('10'))
    const eps = [
      makeEntry({ at: at('2', 10), readings: { pain: 8 }, kind: 'episode' }),
      makeEntry({ at: at('4', 8), readings: { pain: 6 }, kind: 'episode' }),
    ]
    eps[1].endedAt = at('4', 10)
    eps[0].endedAt = at('2', 13)
    const s = summarize([...eps, e('6', 2), e('6', 4)], 7, 'pain', now)
    expect(s.entries).toBe(4)
    expect(s.daysWithEntries).toBe(3)
    expect(s.mean).toBe(5)
    expect(s.max).toBe(8)
    expect(s.daysAtLeast5).toBe(2)
    expect(s.episodes).toBe(2)
    expect(s.meanEpisodeMs).toBe(2.5 * 3_600_000)
    expect(s.maxEpisodeMs).toBe(3 * 3_600_000)
    expect(s.hoursPerWeek).toBe(5)
    expect(summarize([], 7).mean).toBeNull()
  })

  it('measures pain over the entries that read it: one without a pain reading is not a 0', () => {
    const mind = (day: string, fog: number) => makeEntry({ at: at(day), layers: [L(['mind'], { fog })] })
    const from = new Date(2026, 2, 1)
    expect(dailySeries([e('1', 6), mind('1', 2), mind('2', 3)], from, 2).map((p) => [p.max, p.mean, p.count])).toEqual([[6, 6, 1], [null, null, 0]])
    const s = summarize([e('1', 6), mind('1', 2), mind('2', 3)], 7)
    expect(s).toMatchObject({ entries: 3, daysWithEntries: 2, mean: 6, max: 6, daysAtLeast5: 1 })
    expect(summarize([mind('1', 2)], 7)).toMatchObject({ entries: 1, mean: null, max: null, daysAtLeast5: 0 })
    // Days without a pain reading sit out the comparison.
    const tagged = (day: string, tags: string[], pain?: number) => makeEntry({ at: at(day), layers: [{ regions: [], readings: pain === undefined ? { fog: 4 } : { pain }, tags }] })
    const days = [tagged('1', ['heat'], 8), tagged('2', ['heat'], 6), tagged('3', [], 2), tagged('4', [], 4), tagged('5', ['heat']), tagged('6', [])]
    expect(tagComparison(days, DEFAULT_TAGS, 'pain', 2)).toEqual([expect.objectContaining({ tag: expect.objectContaining({ id: 'heat' }), withN: 2, withoutN: 2, withMean: 7, withoutMean: 3 })])
  })

  it('computes region heat for one symptom, an entry counting once per region at the max over its layers', () => {
    const h = regionHeat([
      e('1', 8, { layers: [L(['152'], { pain: 8 })] }),
      e('2', 4, { layers: [L(['152', '110'], { pain: 4 })] }),
      e('3', 2, { layers: [L(['*'], { pain: 2 })] }),
    ])
    expect(h.get('152')).toEqual({ mean: 14 / 3, count: 3, weight: 1 })
    expect(h.get('110')?.count).toBe(2)
    expect(h.get('261')).toEqual({ mean: 2, count: 1, weight: Math.log(2) / Math.log(4) })
    // The mind is one more region; full body does not cover it.
    expect(h.get('mind')).toBeUndefined()
    // Overlapping layers: the max wins, the entry counts once. A layer without the symptom contributes nothing.
    const b = regionHeat(
      [
        e('4', 0, { layers: [L(['152'], { pain: 3 }), L(['152', '110'], { pain: 7 }), L(['mind'], { fog: 6 })] }),
        e('5', 0, { layers: [L(['152'], { swelling: 5 })] }),
        e('6', 0, { layers: [L(['*', 'mind'], { pain: 2, fog: 4 })] }),
      ],
    )
    expect(b.get('152')).toEqual({ mean: 4.5, count: 2, weight: 1 })
    expect(b.get('110')).toEqual({ mean: 4.5, count: 2, weight: 1 })
    expect(b.get('mind')).toEqual({ mean: 2, count: 1, weight: Math.log(2) / Math.log(3) })
    const f = regionHeat([e('4', 0, { layers: [L(['mind'], { fog: 6 })] }), e('6', 0, { layers: [L(['*', 'mind'], { pain: 2, fog: 4 })] })], 'fog')
    expect(f.get('mind')).toEqual({ mean: 5, count: 2, weight: 1 })
    expect(f.get('152')).toEqual({ mean: 4, count: 1, weight: Math.log(2) / Math.log(3) })
    expect(regionHeat([e('4', 0, { layers: [L(['mind'], { fog: 6 })] })], 'swelling').size).toBe(0)
  })

  it('weighs frequency on a log scale, so the rare end keeps its steps (#23)', () => {
    const entries = Array.from({ length: 20 }, (_, i) => e(String(i), 5, { layers: [L(i < 1 ? ['152', '110', '261'] : i < 2 ? ['152', '110'] : ['152'], { pain: 5 })] }))
    const h = regionHeat(entries)
    const w = (id: string) => h.get(id)!.weight
    expect(w('152')).toBe(1)
    expect(w('261')).toBeCloseTo(0.228, 3)
    expect(w('110')).toBeCloseTo(0.361, 3)
    // Twice is a clear step up from once; the linear scale made both near nothing (0.05, 0.1).
    expect(w('110') - w('261')).toBeGreaterThan(0.1)
  })

  it('draws frequency as a ring from a hairline to 2.5px, twice as wide since only the inner half shows (#23)', () => {
    expect(ringWidth(0)).toBe(0.75)
    expect(ringWidth(1)).toBe(2.5)
    expect(ringStyle(1)).toBe('stroke-width:5.00px')
  })

  it('compares tags on days with vs without, with a minimum', () => {
    const entries = []
    for (let d = 1; d <= 6; d++) entries.push(e(String(d), 8, { tags: ['badsleep'] }))
    for (let d = 7; d <= 12; d++) entries.push(e(String(d), 3))
    entries.push(e('13', 9, { tags: ['stress'] }))
    const cmp = tagComparison(entries, DEFAULT_TAGS)
    expect(cmp).toHaveLength(1)
    expect(cmp[0].tag.id).toBe('badsleep')
    expect(cmp[0].withN).toBe(6)
    expect(cmp[0].withoutN).toBe(7)
    expect(cmp[0].withMean).toBe(8)
    expect(cmp[0].withoutMean).toBeCloseTo((3 * 6 + 9) / 7)
    expect(tagComparison(entries, DEFAULT_TAGS, 'pain', 1).map((c) => c.tag.id)).toEqual(['badsleep', 'stress'])
    expect(tagCounts(entries, DEFAULT_TAGS).map((x) => [x.tag.id, x.count])).toEqual([['badsleep', 6], ['stress', 1]])
  })

  it('averages other symptoms where recorded', () => {
    const entries = [e('1', 5, { readings: { swelling: 6 } }), e('2', 5, { layers: [L(['152'], { swelling: 2 }), L(['110'], { swelling: 1, fog: 0 })] }), e('3', 5)]
    expect(symptomMeans(entries, DEFAULT_SYMPTOMS)).toEqual([{ symptom: DEFAULT_SYMPTOMS[1], mean: 4, count: 2 }])
    // "Other" than the symptom picked (#38): pain is one of them when swelling is picked.
    expect(symptomMeans(entries, DEFAULT_SYMPTOMS, 'swelling')).toEqual([{ symptom: DEFAULT_SYMPTOMS[0], mean: 5, count: 1 }])
    // The highest mean first.
    const more = [...entries, makeEntry({ at: at('4'), layers: [{ regions: ['mind'], readings: { fog: 9 } }] })]
    expect(symptomMeans(more, DEFAULT_SYMPTOMS, 'swelling').map((m) => [m.symptom.id, m.mean])).toEqual([['fog', 9], ['pain', 5]])
  })

  it('measures any symptom the way it measures pain (#38)', () => {
    const sw = (day: string, swelling: number, tags: string[] = []) => makeEntry({ at: at(day), layers: [{ regions: ['152'], readings: { pain: 1, swelling }, tags }] })
    const entries = [sw('1', 3), sw('1', 7), sw('3', 5), e('4', 9)]
    expect(dailySeries(entries, new Date(2026, 2, 1), 4, 'swelling').map((p) => p.max)).toEqual([7, null, 5, null])
    expect(summarize(entries, 7, 'swelling')).toMatchObject({ entries: 4, daysWithEntries: 3, mean: 5, max: 7, daysAtLeast5: 2 })
    const tagged = [sw('1', 8, ['heat']), sw('2', 6, ['heat']), sw('3', 2), sw('4', 4), e('5', 9, { tags: ['heat'] })]
    expect(tagComparison(tagged, DEFAULT_TAGS, 'swelling', 2)).toEqual([expect.objectContaining({ withN: 2, withoutN: 2, withMean: 7, withoutMean: 3 })])
  })

  it('lists the symptoms read in range in vocabulary order, a reading of 0 included, disabled ones too', () => {
    const symptoms = DEFAULT_SYMPTOMS.map((s) => (s.id === 'stiffness' ? { ...s, order: -1, enabled: false } : s))
    const entries = [e('1', 0, { layers: [L(['152'], { swelling: 2 }), L(['mind'], { fog: 0 })] }), e('2', 4, { readings: { stiffness: 3, ghost: 5 } })]
    expect(symptomsRead(entries, symptoms).map((s) => s.id)).toEqual(['stiffness', 'swelling', 'fog'])
    expect(symptomsRead([], symptoms)).toEqual([])
  })

  it('range helpers', () => {
    const now = new Date(2026, 2, 10, 15)
    expect(rangeStart(7, now).getTime()).toBe(new Date(2026, 2, 4).getTime())
    expect(inRange([e('3'.toString(), 1), e('5', 1)], rangeStart(7, now))).toHaveLength(1)
  })
})

describe('presetSeries', () => {
  it('gives one line per preset with samples only: pain when any layer asks for it, else the first thing its first layer asks', () => {
    const presets: Preset[] = [
      { id: 'a', name: 'Schiena', layers: [{ regions: [], asks: ['pain'] }], kind: 'chronic', order: 0 },
      { id: 'b', name: 'Gambe', layers: [{ regions: ['mind'], asks: ['fog'] }, { regions: ['224'], asks: ['swelling'] }], kind: 'chronic', order: 1 },
      { id: 'c', name: 'Unused', layers: [{ regions: [], asks: ['pain'] }], kind: 'chronic', order: 2 },
      { id: 'd', name: 'Testa e schiena', layers: [{ regions: ['mind'], asks: ['fog'] }, { regions: ['224'], asks: ['swelling', 'pain'] }], kind: 'chronic', order: 3 },
    ]
    const mk = (id: string, at: string, readings: Record<string, number>, presetId?: string) => ({ ...makeEntry({ at, readings, presetId }), id })
    const entries = [
      mk('1', '2026-09-03T10:00:00.000Z', { pain: 4 }, 'a'),
      mk('2', '2026-09-01T10:00:00.000Z', { pain: 6 }, 'a'),
      mk('3', '2026-09-02T10:00:00.000Z', { pain: 1, swelling: 5, fog: 2 }, 'b'),
      mk('4', '2026-09-02T12:00:00.000Z', { pain: 7 }),
      mk('5', '2026-09-02T13:00:00.000Z', { pain: 1, swelling: 5, fog: 2 }, 'd'),
    ]
    const rows = presetSeries(entries, presets)
    expect(rows.map((r) => r.preset.id)).toEqual(['a', 'b', 'd'])
    expect(rows[0].points.map((p) => [p.at, p.value])).toEqual([[Date.parse('2026-09-01T10:00:00.000Z'), 6], [Date.parse('2026-09-03T10:00:00.000Z'), 4]])
    expect(rows[1].points.map((p) => p.value)).toEqual([2])
    expect(rows[2].points.map((p) => p.value)).toEqual([1])
  })
})

describe('presetSeries edge cases', () => {
  it('falls back to pain for a preset without symptoms and to 0 for a missing reading', () => {
    const presets: Preset[] = [
      { id: 'x', name: 'X', layers: [], kind: 'chronic', order: 0 },
      { id: 'y', name: 'Y', layers: [{ regions: [], asks: ['swelling'] }], kind: 'chronic', order: 1 },
    ]
    const entries = [
      makeEntry({ at: '2026-09-01T10:00:00.000Z', readings: { pain: 3 }, presetId: 'x' }),
      makeEntry({ at: '2026-09-01T10:00:00.000Z', readings: { pain: 3 }, presetId: 'y' }),
    ]
    expect(presetSeries(entries, presets).map((r) => r.points[0].value)).toEqual([3, 0])
  })

  it('an update of an episode opened from a preset is a sample of that preset', () => {
    const presets: Preset[] = [{ id: 'x', name: 'X', layers: [{ regions: [], asks: ['pain'] }], kind: 'episode', order: 0 }]
    const head = makeEntry({ at: '2026-09-01T10:00:00.000Z', kind: 'episode', readings: { pain: 7 }, presetId: 'x' })
    const upd = { ...makeEntry({ at: '2026-09-01T12:00:00.000Z', kind: 'episode', readings: { pain: 3 } }), episodeId: head.id }
    expect(presetSeries([upd, head], presets)[0].points.map((p) => p.value)).toEqual([7, 3])
  })
})
