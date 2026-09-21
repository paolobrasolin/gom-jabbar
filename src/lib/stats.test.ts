import { describe, it, expect } from 'vitest'
import { makeEntry } from './entries'
import { dailySeries, summarize, regionHeat, tagComparison, symptomMeans, rangeStart, inRange, tagCounts } from './stats'
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
      makeEntry({ at: at('2', 10), readings: { pain: 8 }, ongoing: true }),
      makeEntry({ at: at('4', 8), readings: { pain: 6 } }),
    ]
    eps[1].endedAt = at('4', 10)
    eps[1].ongoing = false
    eps[0].endedAt = at('2', 13)
    eps[0].ongoing = false
    const s = summarize([...eps, e('6', 2), e('6', 4)], 7, now)
    expect(s.entries).toBe(4)
    expect(s.daysWithEntries).toBe(3)
    expect(s.meanPain).toBe(5)
    expect(s.maxPain).toBe(8)
    expect(s.daysAtLeast5).toBe(2)
    expect(s.episodes).toBe(2)
    expect(s.meanEpisodeMs).toBe(2.5 * 3_600_000)
    expect(s.maxEpisodeMs).toBe(3 * 3_600_000)
    expect(s.hoursPerWeek).toBe(5)
    expect(summarize([], 7).meanPain).toBeNull()
  })

  it('computes region heat for one symptom, an entry counting once per region at the max over its layers', () => {
    const h = regionHeat([
      e('1', 8, { layers: [L(['152'], { pain: 8 })] }),
      e('2', 4, { layers: [L(['152', '110'], { pain: 4 })] }),
      e('3', 2, { layers: [L(['*'], { pain: 2 })] }),
    ])
    expect(h.get('152')).toEqual({ mean: 14 / 3, count: 3, weight: 1 })
    expect(h.get('110')?.count).toBe(2)
    expect(h.get('261')).toEqual({ mean: 2, count: 1, weight: 1 / 3 })
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
    expect(b.get('mind')).toEqual({ mean: 2, count: 1, weight: 0.5 })
    const f = regionHeat([e('4', 0, { layers: [L(['mind'], { fog: 6 })] }), e('6', 0, { layers: [L(['*', 'mind'], { pain: 2, fog: 4 })] })], 'fog')
    expect(f.get('mind')).toEqual({ mean: 5, count: 2, weight: 1 })
    expect(f.get('152')).toEqual({ mean: 4, count: 1, weight: 0.5 })
    expect(regionHeat([e('4', 0, { layers: [L(['mind'], { fog: 6 })] })], 'swelling').size).toBe(0)
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
    expect(tagComparison(entries, DEFAULT_TAGS, 1).map((c) => c.tag.id)).toEqual(['badsleep', 'stress'])
    expect(tagCounts(entries, DEFAULT_TAGS).map((x) => [x.tag.id, x.count])).toEqual([['badsleep', 6], ['stress', 1]])
  })

  it('averages other symptoms where recorded', () => {
    const m = symptomMeans([e('1', 5, { readings: { swelling: 6 } }), e('2', 5, { layers: [L(['152'], { swelling: 2 }), L(['110'], { swelling: 1, fog: 0 })] }), e('3', 5)], DEFAULT_SYMPTOMS)
    expect(m).toEqual([{ symptom: DEFAULT_SYMPTOMS[1], mean: 4, count: 2 }])
  })

  it('range helpers', () => {
    const now = new Date(2026, 2, 10, 15)
    expect(rangeStart(7, now).getTime()).toBe(new Date(2026, 2, 4).getTime())
    expect(inRange([e('3'.toString(), 1), e('5', 1)], rangeStart(7, now))).toHaveLength(1)
  })
})

describe('presetSeries', () => {
  it('gives one line per preset with samples only, following the preset first symptom', () => {
    const presets: Preset[] = [
      { id: 'a', name: 'Schiena', layers: [], symptomIds: ['pain'], ongoing: false, order: 0 },
      { id: 'b', name: 'Gambe', layers: [], symptomIds: ['swelling', 'pain'], ongoing: false, order: 1 },
      { id: 'c', name: 'Unused', layers: [], symptomIds: ['pain'], ongoing: false, order: 2 },
    ]
    const mk = (id: string, at: string, readings: Record<string, number>, preset?: string) => ({ ...makeEntry({ at, readings }), id, ...(preset ? { preset } : {}) })
    const entries = [
      mk('1', '2026-09-03T10:00:00.000Z', { pain: 4 }, 'a'),
      mk('2', '2026-09-01T10:00:00.000Z', { pain: 6 }, 'a'),
      mk('3', '2026-09-02T10:00:00.000Z', { pain: 1, swelling: 5 }, 'b'),
      mk('4', '2026-09-02T12:00:00.000Z', { pain: 7 }),
    ]
    const rows = presetSeries(entries, presets)
    expect(rows.map((r) => r.preset.id)).toEqual(['a', 'b'])
    expect(rows[0].points.map((p) => [p.at, p.value])).toEqual([[Date.parse('2026-09-01T10:00:00.000Z'), 6], [Date.parse('2026-09-03T10:00:00.000Z'), 4]])
    expect(rows[1].points.map((p) => p.value)).toEqual([5])
  })
})

describe('presetSeries edge cases', () => {
  it('falls back to pain for a preset without symptoms and to 0 for a missing reading', () => {
    const presets: Preset[] = [
      { id: 'x', name: 'X', layers: [], symptomIds: [], ongoing: false, order: 0 },
      { id: 'y', name: 'Y', layers: [], symptomIds: ['swelling'], ongoing: false, order: 1 },
    ]
    const entries = [
      { ...makeEntry({ at: '2026-09-01T10:00:00.000Z', readings: { pain: 3 } }), preset: 'x' },
      { ...makeEntry({ at: '2026-09-01T10:00:00.000Z', readings: { pain: 3 } }), preset: 'y' },
    ]
    expect(presetSeries(entries, presets).map((r) => r.points[0].value)).toEqual([3, 0])
  })
})
