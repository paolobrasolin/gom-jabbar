import { describe, it, expect } from 'vitest'
import { makeEntry } from './entries'
import { dailySeries, rangeDays, summarize, regionHeat, fullBody, symptomMedians, symptomsRead, rangeStart, rangeEnd, tagCounts, ringWidth, ringStyle } from './stats'
import { DEFAULT_TAGS, DEFAULT_SYMPTOMS } from './vocabulary'
import { presetSeries, chronicRows, episodeLanes, episodeCounts } from './stats'
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
    expect(s[0].median).toBe(5)
    // A level is ordinal (#120): a day at 1, 2 and 9 is a day at 2, not at 4.
    expect(dailySeries([e('1', 1), e('1', 2), e('1', 9)], from, 1)[0].median).toBe(2)
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
    const s = summarize([...eps, e('6', 2), e('6', 4)], 'pain', now)
    expect(s.entries).toBe(4)
    // The chronic readings apart, as the log form's Tipo has them (#120): two entries on one day.
    expect(s.chronicEntries).toBe(2)
    expect(s.chronicDays).toBe(1)
    // Days 8, 6 and (2 + 4) / 2.
    expect(s.mean).toBeCloseTo(17 / 3)
    expect(s.max).toBe(8)
    // Each day counted once at its worst: 8, 6 and 4; the median of those.
    expect(s.worst).toEqual([0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0])
    expect(s.median).toBe(6)
    expect(s.episodes).toBe(2)
    // Both ended: 3h and 2h.
    expect(s.medianEpisodeMs).toBe(2.5 * 3_600_000)
    expect(s.ongoing).toBe(0)
    expect(summarize([]).mean).toBeNull()
  })

  it('episode durations: the median of the ended ones; one still going on is counted apart, never as its time so far', () => {
    const now = Date.parse(at('20'))
    const ep = (day: string, hours: number | null) => {
      const h = makeEntry({ at: at(day, 8), readings: { pain: 6 }, kind: 'episode' })
      h.endedAt = hours === null ? null : new Date(Date.parse(h.at) + hours * 3_600_000).toISOString()
      return h
    }
    // Ended 1h, 2h, 10h; one forgotten for days, and one begun minutes ago.
    const s = summarize([ep('1', 1), ep('2', 2), ep('3', 10), ep('4', null), makeEntry({ at: new Date(now - 300_000).toISOString(), readings: { pain: 3 }, kind: 'episode' })], 'pain', now)
    expect(s.episodes).toBe(5)
    expect(s.medianEpisodeMs).toBe(2 * 3_600_000)
    expect(s.ongoing).toBe(2)
    // Nothing ended yet: no median.
    expect(summarize([ep('4', null)], 'pain', now)).toMatchObject({ episodes: 1, medianEpisodeMs: null, ongoing: 1 })
    // An even count: the middle two averaged.
    expect(summarize([ep('1', 1), ep('2', 3)], 'pain', now).medianEpisodeMs).toBe(2 * 3_600_000)
  })

  it('counts each day once at its worst, level by level, with the median of those days (#114)', () => {
    const s = summarize([e('1', 3), e('1', 7), e('2', 5), e('3', 0), e('4', 7)])
    expect(s.worst).toEqual([1, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0])
    // Days at 0, 5, 7 and 7: an even count takes the middle two.
    expect(s.median).toBe(6)
    expect(summarize([e('1', 3), e('2', 9), e('3', 4)]).median).toBe(4)
  })

  it('averages per day, then across days: a day logged twenty times weighs as much as a day logged once', () => {
    // 29 quiet days at 3 and one migraine day: the start at 8, then twenty updates at 8.
    const quiet = Array.from({ length: 29 }, (_, i) => makeEntry({ at: new Date(2026, 2, i + 1, 12).toISOString(), readings: { pain: 3 } }))
    const migraine = Array.from({ length: 21 }, () => makeEntry({ at: new Date(2026, 2, 30, 12).toISOString(), readings: { pain: 8 } }))
    const s = summarize([...quiet, ...migraine])
    expect(s.mean).toBeCloseTo((29 * 3 + 8) / 30)
    expect(s.max).toBe(8)
    // The other symptoms too, each day once at its highest: three readings of 2 on one day are one day at 2.
    const fog = (d: string, v: number) => makeEntry({ at: at(d), layers: [{ regions: ['mind'], readings: { fog: v } }] })
    expect(symptomMedians([fog('1', 2), fog('1', 2), fog('1', 2), fog('2', 8)], DEFAULT_SYMPTOMS)).toEqual([{ symptom: DEFAULT_SYMPTOMS.find((x) => x.id === 'fog'), median: 5, count: 2 }])
  })

  it('one symptom, one figure: a reading of 0 counts under Altri sintomi as it does when the symptom is picked (#114, #120)', () => {
    const swell = (day: string, pain: number, swelling: number) => makeEntry({ at: at(day), layers: [L(['152'], { pain, swelling })] })
    const entries = [swell('1', 4, 0), swell('2', 6, 6), swell('2', 2, 3), e('3', 5)]
    // Days at 0 and at 6 (the higher of 6 and 3): the median of each day's highest, as Quanto gives the symptom picked.
    const others = symptomMedians(entries, DEFAULT_SYMPTOMS, 'pain')
    expect(others).toEqual([{ symptom: DEFAULT_SYMPTOMS.find((x) => x.id === 'swelling'), median: 3, count: 2 }])
    for (const s of DEFAULT_SYMPTOMS) {
      const picked = summarize(entries, s.id).median
      const listed = symptomMedians(entries, DEFAULT_SYMPTOMS, 'other').find((m) => m.symptom.id === s.id)?.median ?? null
      expect(listed, s.id).toBe(picked)
    }
  })

  it('measures pain over the entries that read it: one without a pain reading is not a 0', () => {
    const mind = (day: string, fog: number) => makeEntry({ at: at(day), layers: [L(['mind'], { fog })] })
    const from = new Date(2026, 2, 1)
    expect(dailySeries([e('1', 6), mind('1', 2), mind('2', 3)], from, 2).map((p) => [p.max, p.median, p.count])).toEqual([[6, 6, 1], [null, null, 0]])
    const s = summarize([e('1', 6), mind('1', 2), mind('2', 3)])
    expect(s).toMatchObject({ entries: 3, mean: 6, max: 6, median: 6 })
    expect(summarize([mind('1', 2)])).toMatchObject({ entries: 1, mean: null, max: null, median: null, worst: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
  })

  it('computes region heat for one symptom, an entry counting once per region at the max over its layers', () => {
    const h = regionHeat([
      e('1', 8, { layers: [L(['152'], { pain: 8 })] }),
      e('2', 4, { layers: [L(['152', '110'], { pain: 4 })] }),
      e('3', 2, { layers: [L(['*'], { pain: 2 })] }),
    ])
    expect(h.get('152')).toEqual({ median: 6, count: 2, weight: 1 })
    expect(h.get('110')).toEqual({ median: 4, count: 1, weight: Math.log(2) / Math.log(3) })
    // The median, not the mean (#120): one bad 9 among 2s does not tint the region, and the colour is a step of the key.
    expect(regionHeat([e('1', 2, { layers: [L(['152'], { pain: 2 })] }), e('2', 2, { layers: [L(['152'], { pain: 2 })] }), e('3', 9, { layers: [L(['152'], { pain: 9 })] })]).get('152')?.median).toBe(2)
    // Full body is not every region at once (#114): one such entry would light all 74 and dilute each.
    expect(h.get('261')).toBeUndefined()
    expect(h.get('*')).toBeUndefined()
    expect(h.get('mind')).toBeUndefined()
    // Overlapping layers: the max wins, the entry counts once. A layer without the symptom contributes nothing.
    const b = regionHeat(
      [
        e('4', 0, { layers: [L(['152'], { pain: 3 }), L(['152', '110'], { pain: 7 }), L(['mind'], { fog: 6 })] }),
        e('5', 0, { layers: [L(['152'], { swelling: 5 })] }),
        e('6', 0, { layers: [L(['*', 'mind'], { pain: 2, fog: 4 })] }),
      ],
    )
    expect(b.get('152')).toEqual({ median: 7, count: 1, weight: 1 })
    expect(b.get('110')).toEqual({ median: 7, count: 1, weight: 1 })
    // The mind is one more region, beside full body as beside any other.
    expect(b.get('mind')).toEqual({ median: 2, count: 1, weight: 1 })
    const f = regionHeat([e('4', 0, { layers: [L(['mind'], { fog: 6 })] }), e('6', 0, { layers: [L(['*', 'mind'], { pain: 2, fog: 4 })] })], 'fog')
    expect(f.get('mind')).toEqual({ median: 5, count: 2, weight: 1 })
    expect(f.get('152')).toBeUndefined()
    expect(regionHeat([e('4', 0, { layers: [L(['mind'], { fog: 6 })] })], 'swelling').size).toBe(0)
  })

  it('counts full body apart: the entries reading the symptom on the whole body, and their median (#114, #120)', () => {
    const entries = [
      e('1', 0, { layers: [L(['*'], { pain: 2 })] }),
      e('2', 0, { layers: [L(['*', 'mind'], { pain: 6, fog: 3 }), L(['*'], { pain: 4 })] }),
      e('3', 0, { layers: [L(['*'], { swelling: 5 })] }),
      e('4', 8, { layers: [L(['152'], { pain: 8 })] }),
    ]
    expect(fullBody(entries)).toEqual({ median: 4, count: 2 })
    expect(fullBody(entries, 'swelling')).toEqual({ median: 5, count: 1 })
    // 2, 2, 6 and 9: the median 4, where the mean said 4.75.
    expect(fullBody([...entries, e('5', 0, { layers: [L(['*'], { pain: 9 })] }), e('6', 0, { layers: [L(['*'], { pain: 2 })] })])?.median).toBe(4)
    expect(fullBody(entries, 'fatigue')).toBeNull()
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

  it('counts tag use in days, medications first, the most used first within each group', () => {
    const entries = []
    for (let d = 1; d <= 6; d++) entries.push(e(String(d), 8, { tags: ['badsleep'] }))
    entries.push(e('13', 9, { tags: ['stress'] }))
    expect(tagCounts(entries, DEFAULT_TAGS).map((x) => [x.tag.id, x.days])).toEqual([['badsleep', 6], ['stress', 1]])
  })

  it('names the days of a range across a clock change, the 23-hour day included (#120)', () => {
    expect(rangeDays(new Date(2026, 2, 28), 4)).toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'])
  })

  it('counts tags in days, not entries, medications first: three doses on one day are one day of medication', () => {
    const tagged = (d: string, h: number, tags: string[]) => makeEntry({ at: at(d, h), layers: [{ regions: ['152'], readings: { pain: 4 }, tags }] })
    const entries = [tagged('1', 8, ['ibuprofen']), tagged('1', 14, ['ibuprofen']), tagged('1', 20, ['ibuprofen']), tagged('2', 9, ['ibuprofen']), tagged('1', 9, ['stress']), tagged('2', 9, ['stress']), tagged('3', 9, ['stress'])]
    const tags = [...DEFAULT_TAGS, { id: 'ibuprofen', label: 'Ibuprofene', group: 'medication' as const, enabled: true, order: 99 }]
    expect(tagCounts(entries, tags).map((x) => [x.tag.id, x.days])).toEqual([['ibuprofen', 2], ['stress', 3]])
    // And which days, in order, for the rows under the chart (#120).
    expect(tagCounts(entries, tags).map((x) => x.on)).toEqual([['2026-03-01', '2026-03-02'], ['2026-03-01', '2026-03-02', '2026-03-03']])
  })

  it('gives the other symptoms where recorded, a 0 included', () => {
    const entries = [e('1', 5, { readings: { swelling: 6 } }), e('2', 5, { layers: [L(['152'], { swelling: 2 }), L(['110'], { swelling: 1, fog: 0 })] }), e('3', 5)]
    expect(symptomMedians(entries, DEFAULT_SYMPTOMS)).toEqual([
      { symptom: DEFAULT_SYMPTOMS[1], median: 4, count: 2 },
      { symptom: DEFAULT_SYMPTOMS.find((x) => x.id === 'fog'), median: 0, count: 1 },
    ])
    // "Other" than the symptom picked (#38): pain is one of them when swelling is picked.
    expect(symptomMedians(entries, DEFAULT_SYMPTOMS, 'swelling')).toEqual([
      { symptom: DEFAULT_SYMPTOMS[0], median: 5, count: 1 },
      { symptom: DEFAULT_SYMPTOMS.find((x) => x.id === 'fog'), median: 0, count: 1 },
    ])
  })

  it("lists other symptoms in the vocabulary's order, not by mean: a symptom read on one bad day does not lead (#120)", () => {
    const entries = [e('1', 2), e('2', 3), e('3', 2), makeEntry({ at: at('4'), layers: [{ regions: ['mind'], readings: { anxiety: 9, fog: 1 } }] })]
    // Handed in any order, listed by `order`, as the Sintomo picker is.
    const shuffled = [...DEFAULT_SYMPTOMS].reverse()
    expect(symptomMedians(entries, shuffled, 'swelling').map((m) => [m.symptom.id, m.count])).toEqual([['pain', 3], ['fog', 1], ['anxiety', 1]])
  })

  it('measures any symptom the way it measures pain (#38)', () => {
    const sw = (day: string, swelling: number, tags: string[] = []) => makeEntry({ at: at(day), layers: [{ regions: ['152'], readings: { pain: 1, swelling }, tags }] })
    const entries = [sw('1', 3), sw('1', 7), sw('3', 5), e('4', 9)]
    expect(dailySeries(entries, new Date(2026, 2, 1), 4, 'swelling').map((p) => p.max)).toEqual([7, null, 5, null])
    expect(summarize(entries, 'swelling')).toMatchObject({ entries: 4, mean: 5, max: 7, median: 6 })
  })

  it('lists the symptoms read in range in vocabulary order, a reading of 0 included, disabled ones too', () => {
    const symptoms = DEFAULT_SYMPTOMS.map((s) => (s.id === 'stiffness' ? { ...s, order: -1, enabled: false } : s))
    const entries = [e('1', 0, { layers: [L(['152'], { swelling: 2 }), L(['mind'], { fog: 0 })] }), e('2', 4, { readings: { stiffness: 3, ghost: 5 } })]
    expect(symptomsRead(entries, symptoms).map((s) => s.id)).toEqual(['stiffness', 'swelling', 'fog'])
    expect(symptomsRead([], symptoms)).toEqual([])
  })

  it('rangeStart is midnight of the first of the last n days', () => {
    const now = new Date(2026, 2, 10, 15)
    expect(rangeStart(7, now).getTime()).toBe(new Date(2026, 2, 4).getTime())
  })
})

describe('presetSeries', () => {
  it('gives one line per preset with samples only: the lead symptom when any layer asks for it, else the first thing its first layer asks', () => {
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
    const rows = presetSeries(entries, presets, [], DEFAULT_SYMPTOMS)
    expect(rows.map((r) => r.preset.id)).toEqual(['a', 'b', 'd'])
    expect(rows[0].points.map((p) => [p.at, p.value])).toEqual([[Date.parse('2026-09-01T10:00:00.000Z'), 6], [Date.parse('2026-09-03T10:00:00.000Z'), 4]])
    expect(rows[1].points.map((p) => p.value)).toEqual([2])
    expect(rows[2].points.map((p) => p.value)).toEqual([1])
  })
})

describe('presetSeries edge cases', () => {
  it('falls back to the lead symptom for a preset without symptoms', () => {
    const presets: Preset[] = [{ id: 'x', name: 'X', layers: [], kind: 'chronic', order: 0 }]
    const entries = [makeEntry({ at: '2026-09-01T10:00:00.000Z', readings: { pain: 3 }, presetId: 'x' })]
    expect(presetSeries(entries, presets, [], DEFAULT_SYMPTOMS).map((r) => r.points[0].value)).toEqual([3])
  })

  it('follows the lead symptom, not pain, when it leads elsewhere (#36)', () => {
    const presets: Preset[] = [
      { id: 'x', name: 'X', layers: [{ regions: ['224'], asks: ['pain', 'swelling'] }], kind: 'chronic', order: 0 },
      { id: 'y', name: 'Y', layers: [{ regions: ['224'], asks: ['heaviness'] }, { regions: ['130'], asks: ['pain'] }], kind: 'chronic', order: 1 },
    ]
    const entries = [
      makeEntry({ at: '2026-09-01T10:00:00.000Z', readings: { pain: 3, swelling: 6 }, presetId: 'x' }),
      makeEntry({ at: '2026-09-01T11:00:00.000Z', readings: { pain: 2, heaviness: 7 }, presetId: 'y' }),
    ]
    const off = DEFAULT_SYMPTOMS.map((s) => (s.id === 'pain' ? { ...s, enabled: false } : s))
    // Swelling leads: x asks for it; y does not, so its first layer's first symptom.
    expect(presetSeries(entries, presets, [], off).map((r) => r.points[0].value)).toEqual([6, 7])
    // The seed: pain leads, as before.
    expect(presetSeries(entries, presets, [], DEFAULT_SYMPTOMS).map((r) => r.points[0].value)).toEqual([3, 2])
  })

  it('skips a sample without the reading: no reading is not a 0, and a preset with none has no line', () => {
    const presets: Preset[] = [
      { id: 'y', name: 'Y', layers: [{ regions: [], asks: ['swelling'] }], kind: 'chronic', order: 0 },
      { id: 'z', name: 'Z', layers: [{ regions: [], asks: ['swelling'] }], kind: 'chronic', order: 1 },
    ]
    const entries = [
      makeEntry({ at: '2026-09-01T10:00:00.000Z', readings: { pain: 3 }, presetId: 'y' }),
      makeEntry({ at: '2026-09-02T10:00:00.000Z', readings: { swelling: 4 }, presetId: 'y' }),
      makeEntry({ at: '2026-09-03T10:00:00.000Z', readings: { swelling: 0 }, presetId: 'y' }),
      makeEntry({ at: '2026-09-01T10:00:00.000Z', readings: { pain: 3 }, presetId: 'z' }),
    ]
    const rows = presetSeries(entries, presets)
    expect(rows.map((r) => r.preset.id)).toEqual(['y'])
    expect(rows[0].points.map((p) => p.value)).toEqual([4, 0])
  })

  it('an update of an episode opened from a preset is a sample of that preset', () => {
    const presets: Preset[] = [{ id: 'x', name: 'X', layers: [{ regions: [], asks: ['pain'] }], kind: 'episode', order: 0 }]
    const head = makeEntry({ at: '2026-09-01T10:00:00.000Z', kind: 'episode', readings: { pain: 7 }, presetId: 'x' })
    const upd = { ...makeEntry({ at: '2026-09-01T12:00:00.000Z', kind: 'episode', readings: { pain: 3 } }), episodeId: head.id }
    expect(presetSeries([upd, head], presets)[0].points.map((p) => p.value)).toEqual([7, 3])
  })

  it('an update in range counts for its preset when its episode began earlier: the head comes separately', () => {
    const presets: Preset[] = [{ id: 'x', name: 'X', layers: [{ regions: [], asks: ['pain'] }], kind: 'episode', order: 0 }]
    const head = makeEntry({ at: '2026-09-01T10:00:00.000Z', kind: 'episode', readings: { pain: 7 }, presetId: 'x' })
    const upd = { ...makeEntry({ at: '2026-09-09T12:00:00.000Z', kind: 'episode', readings: { pain: 3 } }), episodeId: head.id }
    expect(presetSeries([upd], presets)).toEqual([])
    expect(presetSeries([upd], presets, [head])[0].points.map((p) => p.value)).toEqual([3])
  })
})

describe('rangeEnd', () => {
  it('is the last moment of the range\'s last day, also across the spring clock change', () => {
    const tz = process.env.TZ
    process.env.TZ = 'Europe/Rome'
    try {
      // 30 days to 8 April 2026 hold 29 March, a day of 23 hours.
      const now = new Date(2026, 3, 8, 12)
      const end = rangeEnd(rangeStart(30, now), 30)
      expect([end.getDate(), end.getMonth(), end.getHours(), end.getMinutes()]).toEqual([8, 3, 23, 59])
      // Autumn, 25 hours on 25 October.
      const autumn = rangeEnd(rangeStart(30, new Date(2026, 10, 8, 12)), 30)
      expect([autumn.getDate(), autumn.getMonth(), autumn.getHours()]).toEqual([8, 10, 23])
    } finally {
      // Unset stays unset: `process.env.TZ = undefined` would set the string "undefined", which is UTC for every test after.
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })
})

describe('The Preset cronici and Preset episodici folds (#120)', () => {
  // Built inside each test, never when the file loads: the dates belong to the timezone of the moment they are made.
  const march = () => new Date(2026, 2, 1)
  const at = (d: number, h = 12) => new Date(2026, 2, d, h).toISOString()

  it('draws each chronic preset by day, its highest reading of the day, and leaves episode presets to their bars', () => {
    const presets: Preset[] = [
      { id: 'back', name: 'Schiena', layers: [{ regions: ['224'], asks: ['pain'] }], kind: 'chronic', order: 0 },
      { id: 'mig', name: 'Emicrania', layers: [{ regions: ['100'], asks: ['pain'] }], kind: 'episode', order: 1 },
    ]
    const entries = [
      { ...makeEntry({ at: at(1, 9), readings: { pain: 2 }, presetId: 'back' }), id: '1' },
      { ...makeEntry({ at: at(1, 20), readings: { pain: 5 }, presetId: 'back' }), id: '2' },
      { ...makeEntry({ at: at(3), readings: { pain: 0 }, presetId: 'back' }), id: '3' },
      { ...makeEntry({ at: at(2), readings: { pain: 8 }, presetId: 'mig', kind: 'episode' }), id: '4' },
    ]
    const rows = chronicRows(entries, presets, [], DEFAULT_SYMPTOMS, march(), 4)
    expect(rows.map((r) => [r.preset.id, r.count])).toEqual([['back', 3]])
    // A day without a reading stays empty; a 0 is a day.
    expect(rows[0].series.map((p) => p.max)).toEqual([5, null, 0, null])
  })

  it('makes each episode one bar over the days it touched, coloured by the level shown for it, one lane per episode preset and the rest last', () => {
    const presets: Preset[] = [
      { id: 'mig', name: 'Emicrania', layers: [{ regions: ['100'], asks: ['pain'] }], kind: 'episode', order: 1 },
      { id: 'flare', name: 'Gambe', layers: [{ regions: ['152'], asks: ['pain'] }], kind: 'episode', order: 0 },
    ]
    const head = (id: string, d: number, end: string | null, pain: number, presetId?: string) => ({ ...makeEntry({ at: at(d, 18), kind: 'episode', readings: { pain }, presetId }), id, episodeId: id, endedAt: end })
    const upd = (of: string, d: number, pain: number) => ({ ...makeEntry({ at: at(d, 9), kind: 'episode', readings: { pain } }), id: `${of}-${d}`, episodeId: of })
    const chains = [
      // Three days, worst at its start: shown at its highest once ended.
      head('long', 2, at(4, 10), 7), upd('long', 3, 5), upd('long', 4, 2),
      head('m1', 5, at(5, 22), 6, 'mig'),
      head('f1', 6, at(6, 22), 5, 'flare'),
      // Overlaps the long one: a second row of its lane.
      head('short', 3, at(3, 20), 4),
      // Begun before the range, ended in it: drawn from the first day, and counted with the lane's bars.
      head('old', -1, at(1, 8), 9),
      // Still going on: up to today's column, at its latest reading.
      head('now', 6, null, 8), upd('now', 7, 3),
    ]
    const lanes = episodeLanes(chains, presets, march(), 8, 'pain', new Date(2026, 2, 7, 12).getTime())
    expect(lanes.map((l) => [l.preset?.id ?? null, l.count, l.rows])).toEqual([['flare', 1, 1], ['mig', 1, 1], [null, 4, 2]])
    const bar = (id: string) => lanes.flatMap((l) => l.bars).find((b) => b.id === id)!
    expect(bar('long')).toMatchObject({ first: 1, last: 3, level: 7, row: 0 })
    expect(bar('short')).toMatchObject({ first: 2, last: 2, level: 4, row: 1 })
    expect(bar('old')).toMatchObject({ first: 0, last: 0, level: 9 })
    expect(bar('now')).toMatchObject({ first: 5, last: 6, level: 3 })
    expect(bar('m1')).toMatchObject({ first: 4, last: 4, level: 6, row: 0 })
  })

  it('leaves out an episode over before the range or begun after it, and a preset that asks nothing has no row', () => {
    const head = (id: string, d: number, end: number | null) => ({ ...makeEntry({ at: at(d), kind: 'episode', readings: { pain: 5 } }), id, episodeId: id, endedAt: end === null ? null : at(end) })
    const lanes = episodeLanes([head('before', -5, -3), head('after', 12, 13), head('in', 2, 3)], [], march(), 8, 'pain', new Date(2026, 2, 8, 12).getTime())
    expect(lanes.flatMap((l) => l.bars.map((b) => b.id))).toEqual(['in'])
    const mute: Preset = { id: 'm', name: 'Niente', layers: [{ regions: ['224'], asks: [] }], kind: 'chronic', order: 0 }
    expect(chronicRows([{ ...makeEntry({ at: at(1), readings: {}, presetId: 'm' }), id: '1' }], [mute], [], [], march(), 4)).toEqual([])
  })

  it('counts the episodes begun per week from the range\'s first day, per calendar month past four months', () => {
    const heads = [at(1), at(2), at(9), at(20), new Date(2026, 1, 20, 12).toISOString()].map((iso) => makeEntry({ at: iso, kind: 'episode', readings: { pain: 5 } }))
    const weeks = episodeCounts(heads, march(), 30)
    expect(weeks.per).toBe('week')
    // 1–7, 8–14, 15–21, 22–28, and the week still going, 29–30. The one begun in February is not in range.
    expect(weeks.buckets.map((b) => [b.start.getDate(), b.count])).toEqual([[1, 2], [8, 1], [15, 1], [22, 0], [29, 0]])
    const months = episodeCounts(heads, new Date(2025, 9, 15), 168)
    expect(months.per).toBe('month')
    expect(months.buckets.map((b) => [b.start.getMonth(), b.count])).toEqual([[9, 0], [10, 0], [11, 0], [0, 0], [1, 1], [2, 4]])
    expect(months.buckets[0].start.getDate()).toBe(15)
  })
})
