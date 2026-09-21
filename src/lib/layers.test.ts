import { describe, it, expect } from 'vitest'
import {
  newLayer, showsCategory, allRegions, maxReadings, mergedReadings, mergedTags, prune, tapRegion, tapSet, toggleFull, addLayer, selectLayer,
  setReading, toggleTag, pieceCount, finalize, readingsFor, hasBody, holdsMind, type Layer, type LayerState,
} from './layers'
import { LEG_IDS, MIND } from './regions'
import { DEFAULT_SYMPTOMS } from './vocabulary'

const L = (regions: string[], readings: Record<string, number> = { pain: 5 }, tags: string[] = []): Layer => ({ regions, readings, tags })
const one = (readings = { pain: 5 }) => ({ layers: [newLayer(readings)], cur: 0 })

describe('layer kinds and derived views', () => {
  it('tells body from mind and which sliders a layer shows', () => {
    expect(hasBody(L(['152']))).toBe(true)
    expect(hasBody(L([MIND]))).toBe(false)
    expect(holdsMind(L(['152', MIND]))).toBe(true)
    expect(showsCategory(L([]), 'body')).toBe(true)
    expect(showsCategory(L([]), 'mind')).toBe(true)
    expect(showsCategory(L(['152']), 'body')).toBe(true)
    expect(showsCategory(L(['152']), 'mind')).toBe(false)
    expect(showsCategory(L([MIND]), 'body')).toBe(false)
    expect(showsCategory(L([MIND]), 'mind')).toBe(true)
    expect(showsCategory(L(['152', MIND]), 'mind')).toBe(true)
  })

  it('merges regions, readings (max per symptom) and tags (union, first appearance)', () => {
    const layers = [L(['153', '152'], { pain: 8, swelling: 2 }, ['rest', 'heat']), L(['152', MIND], { pain: 3, fog: 6 }, ['heat', 'stress'])]
    expect(allRegions(layers)).toEqual(['152', '153', MIND])
    expect(mergedReadings(layers)).toEqual({ pain: 8, swelling: 2, fog: 6 })
    expect(maxReadings([{ pain: 1 }, { pain: 4, fog: 0 }])).toEqual({ pain: 4, fog: 0 })
    expect(mergedTags(layers)).toEqual(['rest', 'heat', 'stress'])
    expect(mergedReadings([])).toEqual({})
  })
})

describe('editing layers', () => {
  it('a tap toggles a region in the current layer only, mirrored when asked, the mind never mirrored', () => {
    let s = tapRegion(one({ pain: 6 }), '152', true)
    expect(s.layers).toEqual([{ regions: ['152', '153'], readings: { pain: 6 }, tags: [] }])
    s = tapRegion(s, '152', false)
    expect(s.layers[0].regions).toEqual(['153'])
    s = tapRegion(s, MIND, true)
    expect(s.layers[0].regions).toEqual(['153', MIND])
    // Another layer with the same region: the first is untouched. Layers overlap freely.
    s = addLayer(s, { pain: 2 })
    s = tapRegion(s, '153', false)
    expect(s.layers).toEqual([{ regions: ['153', MIND], readings: { pain: 6 }, tags: [] }, { regions: ['153'], readings: { pain: 2 }, tags: [] }])
    expect(s.cur).toBe(1)
    expect(tapRegion({ layers: [], cur: 0 }, '152', true)).toEqual({ layers: [], cur: 0 })
  })

  it('a set joins or leaves the current layer as a whole; the mind is never part of a set', () => {
    let s = tapSet(one(), LEG_IDS)
    expect(s.layers[0].regions).toEqual([...LEG_IDS].sort())
    s = tapSet(s, [...LEG_IDS, MIND])
    expect(s.layers[0].regions).toEqual([])
    expect(tapSet(s, [MIND])).toEqual(s)
  })

  it('full body fills the current layer, keeps its paint and the mind, and blocks body taps; off, the mind stays', () => {
    const stroke = { region: '152', fig: 'female' as const, view: 'front' as const, points: [[1, 2]] as [number, number][], w: 8 }
    let s: LayerState = { layers: [{ ...L(['152', MIND]), strokes: [stroke] }], cur: 0 }
    s = toggleFull(s)
    expect(s.layers[0]).toEqual({ regions: ['*', MIND], readings: { pain: 5 }, tags: [], strokes: [stroke] })
    expect(tapRegion(s, '110', false)).toEqual(s)
    expect(tapSet(s, LEG_IDS)).toEqual(s)
    expect(tapRegion(s, MIND, false).layers[0].regions).toEqual(['*'])
    s = toggleFull(s)
    expect(s.layers[0]).toEqual({ regions: [MIND], readings: { pain: 5 }, tags: [] })
    expect(toggleFull(one()).layers[0].regions).toEqual(['*'])
    expect(toggleFull({ layers: [], cur: 0 })).toEqual({ layers: [], cur: 0 })
  })

  it('adds a layer only when the current one has regions, drops empty layers when leaving them', () => {
    const s0 = one()
    expect(addLayer(s0, { pain: 3 })).toBe(s0)
    let s = tapRegion(s0, '110', false)
    s = addLayer(s, { pain: 3 })
    expect(s.layers).toHaveLength(2)
    expect(s.cur).toBe(1)
    expect(s.layers[1]).toEqual({ regions: [], readings: { pain: 3 }, tags: [] })
    s = selectLayer(s, 0)
    expect(s.layers).toHaveLength(1)
    expect(s.cur).toBe(0)
    // The emptied first layer goes when another is chosen.
    s = addLayer(s, { pain: 3 })
    s = tapRegion(s, '152', false)
    s = selectLayer(s, 0)
    s = tapRegion(s, '110', false)
    s = selectLayer(s, 1)
    expect(s.layers).toEqual([{ regions: ['152'], readings: { pain: 3 }, tags: [] }])
    expect(s.cur).toBe(0)
    expect(prune({ layers: [L([]), L(['110']), L([])], cur: 2 })).toEqual({ layers: [L(['110']), L([])], cur: 1 })
  })

  it('readings and tags belong to the current layer', () => {
    let s = tapRegion(one(), '110', false)
    s = setReading(s, 'swelling', 4)
    s = toggleTag(s, 'rest')
    s = addLayer(s, { pain: 1 })
    s = setReading(s, 'pain', 7)
    s = toggleTag(s, 'heat')
    expect(s.layers).toEqual([{ regions: ['110'], readings: { pain: 5, swelling: 4 }, tags: ['rest'] }, { regions: [], readings: { pain: 7 }, tags: ['heat'] }])
    expect(toggleTag(s, 'heat').layers[1].tags).toEqual([])
    expect(setReading({ layers: [], cur: 0 }, 'pain', 1)).toEqual({ layers: [], cur: 0 })
    expect(toggleTag({ layers: [], cur: 0 }, 'x')).toEqual({ layers: [], cur: 0 })
    expect(pieceCount(s.layers)).toBe(0)
  })
})

describe('finalize', () => {
  it('drops layers without regions unless none has any, normalizes regions, clamps, dedupes tags, rounds paint', () => {
    const stroke = { region: '152', fig: 'female' as const, view: 'front' as const, points: [[100.123, 250.678]] as [number, number][], w: 8.04 }
    const out = finalize([
      { regions: ['b', 'a', 'a'], readings: { pain: 3.6, x: 11 }, tags: ['r', 'r'] },
      { regions: [], readings: { pain: 9 }, tags: [] },
      { regions: ['x', MIND, '*'], readings: { pain: 2 }, tags: [], strokes: [stroke] },
      { regions: ['110'], readings: { pain: 2 }, tags: [], strokes: [] },
    ])
    expect(out).toEqual([
      { regions: ['a', 'b'], readings: { pain: 4, x: 10 }, tags: ['r'] },
      { regions: ['*', MIND], readings: { pain: 2 }, tags: [], strokes: [{ region: '152', fig: 'female', view: 'front', points: [[100.1, 250.7]], w: 8 }] },
      { regions: ['110'], readings: { pain: 2 }, tags: [] },
    ])
    // Nothing located: the first layer is the reading without a location.
    expect(finalize([L([], { pain: 4 }, ['t']), L([], { pain: 9 })])).toEqual([{ regions: [], readings: { pain: 4 }, tags: ['t'] }])
    expect(finalize([])).toEqual([])
  })

  it('with the vocabulary, keeps only the readings a layer shows; unknown symptoms stay', () => {
    const out = finalize(
      [L([MIND], { pain: 5, fog: 6, custom: 2 }), L(['152'], { pain: 5, fog: 6 }), L([], { pain: 5, fog: 6 }), L(['152', MIND], { pain: 5, fog: 6 })],
      DEFAULT_SYMPTOMS,
    )
    expect(out.map((l) => l.readings)).toEqual([{ fog: 6, custom: 2 }, { pain: 5 }, { pain: 5, fog: 6 }])
    expect(out).toHaveLength(3)
    expect(readingsFor(L([MIND]), { pain: 4, fog: 2, custom: 1 }, DEFAULT_SYMPTOMS)).toEqual({ fog: 2, custom: 1 })
    expect(readingsFor(L([]), { pain: 4, fog: 2 }, DEFAULT_SYMPTOMS)).toEqual({ pain: 4, fog: 2 })
  })
})
