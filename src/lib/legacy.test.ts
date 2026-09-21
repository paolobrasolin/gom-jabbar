import { describe, it, expect } from 'vitest'
import { entryToLayers, presetToLayers, placeReadings, categoryLookup } from './legacy'
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
