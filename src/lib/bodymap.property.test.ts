/** The body map and the form's layers for any region, tap and gesture (#91): regions.ts, layers.ts, strokes.ts. */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { REGIONS, REGION_BY_ID, LEGACY_REGIONS, MIND, FULL_BODY, mirrorId, flipId, counterparts, upgradeRegions, figureBox, regionsFor } from './regions'
import { tapRegion, tapSet, toggleFull, toggleTag, mergedReadings, mergedTags, type LayerState, type Layer } from './layers'
import { addStroke, undoStroke, partition, simplify } from './strokes'
import { diary } from '../test/arbitraries'

const IDS = REGIONS.map((r) => r.id)
const region = fc.constantFrom(...IDS)
const both = fc.record({ sides: fc.boolean(), views: fc.boolean() })
/** The layers of a generated entry, any one of them current. */
const state: fc.Arbitrary<LayerState> = diary
  .chain((f) => fc.constantFrom(...f.entries.map((e) => e.layers), [{ regions: [], readings: {}, tags: [] }] as Layer[]))
  .chain((layers) => fc.integer({ min: 0, max: layers.length - 1 }).map((cur) => ({ layers, cur })))
/** A gesture on one figure and view: a dot, a stroke, or a scribble across segments. */
const raw = fc.constantFrom('female' as const, 'male' as const).chain((fig) => {
  const { w, h } = figureBox(fig)
  return fc.record({
    fig: fc.constant(fig),
    view: fc.constantFrom('front' as const, 'back' as const),
    // A finger's path: a start anywhere on the figure's box, then steps of up to 30 units, rounded to a tenth.
    points: fc
      .tuple(fc.integer({ min: 0, max: w }), fc.integer({ min: 0, max: h }), fc.array(fc.tuple(fc.integer({ min: -300, max: 300 }), fc.integer({ min: -300, max: 300 })), { maxLength: 8 }))
      .map(([x, y, steps]) => steps.reduce<[number, number][]>((ps, [dx, dy]) => [...ps, [Math.round(ps.at(-1)![0] * 10 + dx) / 10, Math.round(ps.at(-1)![1] * 10 + dy) / 10]], [[x, y]])),
    w: fc.integer({ min: 1, max: 20 }),
  })
})
const others = (a: LayerState, b: LayerState) => [a.layers.filter((_, i) => i !== a.cur), b.layers.filter((_, i) => i !== b.cur)]

describe('the body map, for any region and gesture (#91)', () => {
  it('the mirror is on the same view, the other side, and mirrors back', () => {
    fc.assert(
      fc.property(region, (id) => {
        const m = mirrorId(id)!
        expect(REGION_BY_ID[m].view).toBe(REGION_BY_ID[id].view)
        expect(REGION_BY_ID[m].side).not.toBe(REGION_BY_ID[id].side)
        expect(mirrorId(m)).toBe(id)
      }),
    )
    expect([mirrorId(MIND), mirrorId(FULL_BODY)]).toEqual([null, null])
  })

  it('the other view, where a segment has one, keeps the side and flips back', () => {
    fc.assert(
      fc.property(region, (id) => {
        const f = flipId(id)
        if (f === null) return
        expect(REGION_BY_ID[f].view).not.toBe(REGION_BY_ID[id].view)
        expect(REGION_BY_ID[f].side).toBe(REGION_BY_ID[id].side)
        expect(flipId(f)).toBe(id)
      }),
    )
  })

  it('what a tap takes along includes the tap, holds only segments, and is the same from any of its members', () => {
    fc.assert(
      fc.property(region, both, (id, b) => {
        const set = counterparts(id, b)
        expect(set).toContain(id)
        expect(set.every((x) => REGION_BY_ID[x])).toBe(true)
        for (const x of set) expect(new Set(counterparts(x, b))).toEqual(new Set(set))
      }),
    )
  })

  it('old region names become segments that exist, and converting again changes nothing', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...Object.keys(LEGACY_REGIONS), ...IDS, MIND, FULL_BODY), { maxLength: 8 }), (regions) => {
        const once = upgradeRegions(regions)
        expect(once.every((x) => REGION_BY_ID[x] || x === MIND || x === FULL_BODY)).toBe(true)
        expect(upgradeRegions(once)).toEqual(once)
        expect(once).toEqual([...new Set(once)].sort())
      }),
    )
  })
})

describe("the form's layers, for any taps (#91)", () => {
  it('a tap, twice, on a place and its counterparts not on the layer, changes nothing; other layers are never touched', () => {
    fc.assert(
      fc.property(state, region, both, (s, id, b) => {
        const once = tapRegion(s, id, b)
        const [before, after] = others(s, once)
        expect(after).toEqual(before)
        const l = s.layers[s.cur]
        if (l.regions.includes(FULL_BODY) || counterparts(id, b).some((x) => l.regions.includes(x))) return
        expect(tapRegion(once, id, b).layers[s.cur].regions).toEqual(l.regions)
      }),
      { numRuns: 300 },
    )
  })

  it('a quick set, tapped twice when none of it is on the layer, changes nothing', () => {
    fc.assert(
      fc.property(state, fc.subarray(IDS, { minLength: 1, maxLength: 12 }), (s, set) => {
        const l = s.layers[s.cur]
        if (l.regions.includes(FULL_BODY) || set.some((x) => l.regions.includes(x))) return
        expect(tapSet(tapSet(s, set), set).layers[s.cur].regions).toEqual(l.regions)
      }),
      { numRuns: 300 },
    )
  })

  it('full body on keeps the mind and the paint; off again leaves the mind alone', () => {
    fc.assert(
      fc.property(state, (s) => {
        const l = s.layers[s.cur]
        const mind = l.regions.includes(MIND) ? [MIND] : []
        if (l.regions.includes(FULL_BODY)) {
          expect(toggleFull(s).layers[s.cur].regions).toEqual(mind)
          return
        }
        const on = toggleFull(s).layers[s.cur]
        expect(on.regions).toEqual([FULL_BODY, ...mind])
        expect(on.strokes).toEqual(l.strokes)
        expect(toggleFull(toggleFull(s)).layers[s.cur].regions).toEqual(mind)
      }),
      { numRuns: 300 },
    )
  })

  it('a tag tapped twice leaves the same tags', () => {
    fc.assert(
      fc.property(state, fc.constantFrom('rest', 'stress', 't_x', 'period'), (s, tag) => {
        expect(new Set(toggleTag(toggleTag(s, tag), tag).layers[s.cur].tags)).toEqual(new Set(s.layers[s.cur].tags))
      }),
      { numRuns: 300 },
    )
  })

  it('merged readings are the highest per symptom, merged tags each once in order of first appearance', () => {
    fc.assert(
      fc.property(state, ({ layers }) => {
        const keys = new Set(layers.flatMap((l) => Object.keys(l.readings)))
        expect(mergedReadings(layers)).toEqual(Object.fromEntries([...keys].map((k) => [k, Math.max(...layers.flatMap((l) => (k in l.readings ? [l.readings[k]] : [])))])))
        expect(mergedTags(layers)).toEqual([...new Set(layers.flatMap((l) => l.tags))])
      }),
      { numRuns: 300 },
    )
  })
})

describe('paint, for any gesture (#91)', () => {
  it("a gesture's pieces are segments of its view, and there is one at least", () => {
    fc.assert(
      fc.property(raw, (r) => {
        const pieces = partition(r)
        expect(pieces.length).toBeGreaterThan(0)
        const view = new Set(regionsFor(r.view).map((x) => x.id))
        expect(pieces.every((p) => view.has(p.region) && p.fig === r.fig && p.view === r.view && p.w === r.w && p.points.length > 0)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it("undoing a gesture takes back exactly its pieces; its places stay, other layers are never touched", () => {
    fc.assert(
      fc.property(state, raw, (s, r) => {
        const l = s.layers[s.cur]
        const painted = addStroke(s, r)
        const added = (painted.layers[s.cur].strokes?.length ?? 0) - (l.strokes?.length ?? 0)
        expect(added).toBe(partition(r).length)
        const [before, after] = others(s, painted)
        expect(after).toEqual(before)
        const undone = undoStroke(painted, added).layers[s.cur]
        expect(undone.strokes ?? []).toEqual(l.strokes ?? [])
        expect(l.regions.every((x) => undone.regions.includes(x))).toBe(true)
      }),
      { numRuns: 100 },
    )
  })

  it('simplifying keeps the ends, keeps only points it was given, and drops none farther than the tolerance', () => {
    const dist = (p: [number, number], a: [number, number], b: [number, number]) => {
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
      const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
    }
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 0, max: 3000 })).map(([x, y]): [number, number] => [x / 10, y / 10]), { minLength: 1, maxLength: 30 }), (pts) => {
        const out = simplify(pts)
        expect(out[0]).toEqual(pts[0])
        expect(out.at(-1)).toEqual(pts.at(-1))
        expect(out.every((p) => pts.some((q) => q[0] === p[0] && q[1] === p[1]))).toBe(true)
        // Every point dropped lies within the tolerance of the segment of the result that spans it.
        let j = 0
        for (let i = 0; i < pts.length; i++) {
          if (j + 1 < out.length && pts[i][0] === out[j + 1][0] && pts[i][1] === out[j + 1][1]) j++
          if (j + 1 < out.length) expect(dist(pts[i], out[j], out[j + 1])).toBeLessThanOrEqual(0.8 + 1e-9)
        }
      }),
      { numRuns: 500 },
    )
  })
})
