import { describe, it, expect } from 'vitest'
import { entryToLayers, presetToLayers, placeReadings, categoryLookup, splitEpisode, presetKind, presetAsks } from './legacy'
import { DEFAULT_SYMPTOMS } from './vocabulary'

const cat = categoryLookup(DEFAULT_SYMPTOMS)

describe('version 6 rows become layers', () => {
  it('one layer per area at its pain; other readings by category to the first layer of that kind; tags on the first', () => {
    const { layers, history } = entryToLayers(
      {
        areas: [{ regions: ['152'], intensity: 8 }, { regions: ['130'], intensity: 3 }, { regions: ['mind'], intensity: 6 }],
        readings: { pain: 8, swelling: 4, fog: 6, unknown_x: 1 },
        tags: ['rest'],
        history: [{ at: 'a', readings: { pain: 7, fog: 2 } }, { at: 'b', readings: { pain: 8, swelling: 4, fog: 6 } }],
      },
      cat,
    )
    expect(layers).toEqual([
      { regions: ['152'], readings: { pain: 8, swelling: 4, unknown_x: 1 }, tags: ['rest'] },
      { regions: ['130'], readings: { pain: 3 }, tags: [] },
      { regions: ['mind'], readings: { fog: 6 }, tags: [] },
    ])
    expect(history).toEqual([
      { at: 'a', layers: [{ pain: 7 }, {}, { fog: 2 }] },
      { at: 'b', layers: [{ pain: 8, swelling: 4 }, {}, { fog: 6 }] },
    ])
  })

  it('without a body area the entry pain lands with the rest; without areas one layer takes everything; paint stays', () => {
    const stroke = { region: '152', fig: 'female' as const, view: 'front' as const, points: [[1, 2]] as [number, number][], w: 8 }
    expect(entryToLayers({ areas: [{ regions: ['mind'], intensity: 6 }], readings: { pain: 0, fog: 6, swelling: 2 }, tags: ['badsleep'] }, cat)).toEqual({
      layers: [{ regions: ['mind'], readings: { pain: 0, swelling: 2, fog: 6 }, tags: ['badsleep'] }],
    })
    expect(entryToLayers({ areas: [], readings: { pain: 3, fog: 1 }, tags: ['a'] }, cat)).toEqual({ layers: [{ regions: [], readings: { pain: 3, fog: 1 }, tags: ['a'] }] })
    expect(entryToLayers({ areas: [{ regions: ['152'], intensity: 6, strokes: [stroke] }], readings: { pain: 6 }, tags: [] }, cat).layers[0]).toEqual({
      regions: ['152'],
      readings: { pain: 6 },
      tags: [],
      strokes: [stroke],
    })
    // Mind readings with no brain selected stay on the first layer: nothing is dropped.
    expect(entryToLayers({ areas: [{ regions: ['152'], intensity: 5 }], readings: { pain: 5, fog: 3 }, tags: [] }, cat).layers[0].readings).toEqual({ pain: 5, fog: 3 })
    expect(placeReadings({ pain: 1, fog: 2 }, [{ regions: ['mind'] }, { regions: ['152'] }], cat)).toEqual([{ fog: 2 }, { pain: 1 }])
  })

  it('a preset: one layer per area at its level, the tags on the first; a mind area had no pain', () => {
    expect(presetToLayers({ areas: [{ regions: ['224'], intensity: 5 }, { regions: ['mind'], intensity: 6 }], tags: ['med'] })).toEqual([
      { regions: ['224'], readings: { pain: 5 }, tags: ['med'] },
      { regions: ['mind'], readings: {}, tags: [] },
    ])
    expect(presetToLayers({ areas: [], tags: ['med'] })).toEqual([{ regions: [], readings: {}, tags: ['med'] }])
  })

  it('tolerates rows missing readings, tags or history, as a hand-edited file might', () => {
    const bare = { areas: [{ regions: ['152'], intensity: 2 }] } as unknown as Parameters<typeof entryToLayers>[0]
    expect(entryToLayers(bare, cat)).toEqual({ layers: [{ regions: ['152'], readings: { pain: 2 }, tags: [] }] })
    expect(entryToLayers({ areas: [], readings: { pain: 1 } } as unknown as Parameters<typeof entryToLayers>[0], cat)).toEqual({ layers: [{ regions: [], readings: { pain: 1 }, tags: [] }] })
    expect(presetToLayers({ areas: [{ regions: ['224'], intensity: 5 }] } as unknown as Parameters<typeof presetToLayers>[0])).toEqual([{ regions: ['224'], readings: { pain: 5 }, tags: [] }])
    expect(presetToLayers({} as unknown as Parameters<typeof presetToLayers>[0])).toEqual([{ regions: [], readings: {}, tags: [] }])
  })

  it('looks categories up in the vocabulary at hand, falling back to the default for the id', () => {
    const c = categoryLookup([{ id: 'fog', category: 'body' }, { id: 'x' }])
    expect(c('fog')).toBe('body')
    expect(c('x')).toBe('body')
    expect(cat('fog')).toBe('mind')
    expect(cat('anything')).toBe('body')
  })
})

describe('version 7 rows become chains (§8, 7 → 8)', () => {
  const L = (regions: string[], readings: Record<string, number>, tags: string[] = []) => ({ regions, readings, tags })
  const base = { note: 'n', createdAt: '2026-09-02T20:00:30.000Z', updatedAt: '2026-09-03T02:00:10.000Z' }

  it('a moment is a chronic snapshot; preset becomes presetId; ongoing, history and preset go', () => {
    const [c] = splitEpisode({ id: 'a', at: '2026-09-01T07:30:00.000Z', endedAt: null, ongoing: false, layers: [L(['152'], { pain: 3 })], preset: 'p1', extra: 1, ...base })
    expect(c).toEqual({ id: 'a', kind: 'chronic', at: '2026-09-01T07:30:00.000Z', layers: [L(['152'], { pain: 3 })], presetId: 'p1', extra: 1, ...base })
    expect(c).not.toHaveProperty('ongoing')
    expect(c).not.toHaveProperty('endedAt')
    expect(c).not.toHaveProperty('preset')
  })

  it('an episode with a history from its start: the head takes the first point, each later point is an update', () => {
    const strokes = [{ region: '152', fig: 'female' as const, view: 'front' as const, points: [[1, 2]] as [number, number][], w: 8 }]
    const rows = splitEpisode({
      id: 'e',
      at: '2026-09-02T20:00:00.000Z',
      endedAt: '2026-09-03T02:00:00.000Z',
      ongoing: false,
      layers: [{ ...L(['152'], { pain: 2 }, ['rest']), strokes }, L(['mind'], { fog: 1 })],
      history: [
        { at: '2026-09-02T20:00:00.000Z', layers: [{ pain: 7 }, { fog: 5 }] },
        { at: '2026-09-02T22:00:00.000Z', layers: [{ pain: 4 }, { fog: 5 }] },
        { at: '2026-09-03T00:30:00.000Z', layers: [{ pain: 2 }, { fog: 1 }] },
      ],
      ...base,
    })
    expect(rows.map((r) => r.id)).toEqual(['e', 'e:1', 'e:2'])
    expect(rows[0]).toEqual({ id: 'e', kind: 'episode', episodeId: 'e', at: '2026-09-02T20:00:00.000Z', endedAt: '2026-09-03T02:00:00.000Z', layers: [{ ...L(['152'], { pain: 7 }, ['rest']), strokes }, L(['mind'], { fog: 5 })], ...base })
    expect(rows[1]).toEqual({ id: 'e:1', kind: 'episode', episodeId: 'e', at: '2026-09-02T22:00:00.000Z', layers: [{ ...L(['152'], { pain: 4 }), strokes }, L(['mind'], { fog: 5 })], note: '', createdAt: '2026-09-02T22:00:00.000Z', updatedAt: '2026-09-02T22:00:00.000Z' })
    expect(rows[2].layers.map((l) => l.readings)).toEqual([{ pain: 2 }, { fog: 1 }])
    expect(rows[1]).not.toHaveProperty('endedAt')
  })

  it('readings edited after the last update are one more reading at updatedAt', () => {
    const rows = splitEpisode({
      id: 'e',
      at: '2026-09-02T20:00:00.000Z',
      endedAt: null,
      ongoing: true,
      layers: [L(['152'], { pain: 9 })],
      history: [
        { at: '2026-09-02T20:00:00.000Z', layers: [{ pain: 7 }] },
        { at: '2026-09-02T22:00:00.000Z', layers: [{ pain: 4 }] },
      ],
      ...base,
    })
    expect(rows.map((r) => [r.id, r.at, r.layers[0].readings.pain])).toEqual([
      ['e', '2026-09-02T20:00:00.000Z', 7],
      ['e:1', '2026-09-02T22:00:00.000Z', 4],
      ['e:2', base.updatedAt, 9],
    ])
    expect(rows[0].endedAt).toBeNull()
  })

  it('a history from before version 3 does not start at the head: the head keeps its readings, every point is an update', () => {
    const rows = splitEpisode({
      id: 'e',
      at: '2026-09-02T20:00:00.000Z',
      endedAt: '2026-09-03T02:00:00.000Z',
      ongoing: false,
      layers: [L(['100'], { pain: 4 }, ['med-x1'])],
      history: [
        { at: '2026-09-02T22:00:00.000Z', layers: [{ pain: 7 }] },
        { at: '2026-09-03T00:30:00.000Z', layers: [{ pain: 4 }] },
      ],
      ...base,
    })
    expect(rows.map((r) => [r.id, r.at, r.layers[0].readings.pain, r.layers[0].tags])).toEqual([
      ['e', '2026-09-02T20:00:00.000Z', 4, ['med-x1']],
      ['e:1', '2026-09-02T22:00:00.000Z', 7, []],
      ['e:2', '2026-09-03T00:30:00.000Z', 4, []],
    ])
  })

  it('an ongoing episode without updates is a head alone; a moment with a history is an episode too', () => {
    expect(splitEpisode({ id: 'o', at: 'x', endedAt: null, ongoing: true, layers: [L([], { pain: 1 })], ...base })).toEqual([{ id: 'o', kind: 'episode', episodeId: 'o', at: 'x', endedAt: null, layers: [L([], { pain: 1 })], ...base }])
    const odd = splitEpisode({ id: 'h', at: 'x', endedAt: null, ongoing: false, layers: [L([], { pain: 1 })], history: [{ at: 'y', layers: [{ pain: 3 }] }], ...base })
    expect(odd.map((r) => r.id)).toEqual(['h', 'h:1'])
    expect(odd[0].kind).toBe('episode')
    // Rows from before version 2 files may lack the flags altogether.
    expect(splitEpisode({ id: 'm', at: 'x', layers: [L([], { pain: 1 })], ...base })[0].kind).toBe('chronic')
  })

  it('a preset: ongoing becomes kind', () => {
    expect(presetKind({ id: 'p', ongoing: true, name: 'x' })).toEqual({ id: 'p', kind: 'episode', name: 'x' })
    expect(presetKind({ id: 'p', name: 'x' })).toEqual({ id: 'p', kind: 'chronic', name: 'x' })
  })
})

describe('version 8 → 9: a preset asks per layer', () => {
  const categoryOf = categoryLookup([{ id: 'fog', category: 'mind' }])
  it('splits symptomIds over the layers by what each shows, keeps readings and tags, drops the list', () => {
    const p = presetAsks({ id: 'p', symptomIds: ['pain', 'fog', 'swelling'], layers: [{ regions: ['224'], readings: { pain: 3 }, tags: ['heat'] }, { regions: ['mind'], readings: {}, tags: [] }], kind: 'chronic' }, categoryOf)
    expect(p).toEqual({ id: 'p', kind: 'chronic', layers: [{ regions: ['224'], readings: { pain: 3 }, tags: ['heat'], asks: ['pain', 'swelling'] }, { regions: ['mind'], readings: {}, tags: [], asks: ['fog'] }] })
    expect(p).not.toHaveProperty('symptomIds')
  })
  it('a preset without layers gets one unlocated layer asking the whole list; an unlocated layer shows everything', () => {
    expect(presetAsks({ symptomIds: ['fog', 'pain'], layers: [] }, categoryOf)).toEqual({ layers: [{ regions: [], asks: ['fog', 'pain'] }] })
    expect(presetAsks({ symptomIds: ['fog', 'pain'], layers: [{ regions: [], readings: {}, tags: [] }] }, categoryOf)).toEqual({ layers: [{ regions: [], readings: {}, tags: [], asks: ['fog', 'pain'] }] })
    expect(presetAsks({}, categoryOf)).toEqual({ layers: [{ regions: [], asks: [] }] })
    // A layer without regions (only a hand-edited file) is read as unlocated rather than throwing inside the upgrade.
    expect(presetAsks({ symptomIds: ['pain'], layers: [{ readings: {} }] }, categoryOf)).toEqual({ layers: [{ readings: {}, regions: [], asks: ['pain'] }] })
  })
})
