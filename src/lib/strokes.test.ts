import { describe, it, expect } from 'vitest'
import { regionAt, regionNear, partition, simplify, addStroke, undoStroke, clearStrokes, allStrokes, strokePath, clientToFigure, figureCenter, mainView, BRUSH, type RawStroke } from './strokes'
import { finalize, tapRegion, tapSet, toggleFull, newLayer, pieceCount, type Stroke } from './layers'
import { REGION_BY_ID, shapeOf, shapeCenter, figureBox, type FigureId } from './regions'

const F: FigureId = 'female'
const centre = (id: string, fig: FigureId = F): [number, number] => shapeCenter(shapeOf(fig, REGION_BY_ID[id]))
const viewOf = (id: string) => REGION_BY_ID[id].view
/** A gesture: a dot at the centre of a region, or a line between two centres. */
const dot = (id: string, fig: FigureId = F): RawStroke => ({ fig, view: viewOf(id), points: [centre(id, fig)], w: BRUSH })
const line = (a: string, b: string): RawStroke => ({ fig: F, view: viewOf(a), points: [centre(a), centre(b)], w: BRUSH })
/** The piece a dot becomes. */
const piece = (id: string, fig: FigureId = F): Stroke => ({ region: id, ...dot(id, fig) })
const empty = { layers: [newLayer({ pain: 6 })], cur: 0 }
const L = (regions: string[], pain: number, strokes?: Stroke[]) => ({ regions, readings: { pain }, tags: [], ...(strokes ? { strokes } : {}) })
const regionsOf = (pieces: Stroke[]) => pieces.map((p) => p.region)
const first = (p: Stroke) => p.points[0]
const last = (p: Stroke) => p.points[p.points.length - 1]

/** A gesture from the centre of `a` towards the centre of `b`, ending `depth` units past the border into `b`. */
function into(a: string, b: string, depth: number): RawStroke {
  const [ax, ay] = centre(a)
  const [bx, by] = centre(b)
  const L = Math.hypot(bx - ax, by - ay)
  let s = 0
  while (s < L && regionAt(F, viewOf(a), ax + ((bx - ax) * s) / L, ay + ((by - ay) * s) / L) !== b) s += 0.5
  const t = (s + depth) / L
  return { fig: F, view: viewOf(a), points: [[ax, ay], [ax + (bx - ax) * t, ay + (by - ay) * t]], w: BRUSH }
}

describe('regionAt', () => {
  it('finds the region under a point, on both views and both figures', () => {
    for (const fig of ['female', 'male'] as const) {
      for (const id of ['152', '153', '110', '100', '134', '261', '227', '200', '144', '265', '114']) {
        const [x, y] = centre(id, fig)
        expect(regionAt(fig, viewOf(id), x, y), `${fig} ${id}`).toBe(id)
      }
    }
  })

  it('snaps a point outside the figure to the nearest segment', () => {
    const box = figureBox(F)
    expect(regionAt(F, 'front', box.w / 2, -20)).toMatch(/^10[01]$/)
    expect(regionAt(F, 'front', -20, centre('145')[1])).toBe('145')
    expect(regionAt(F, 'back', box.w + 20, centre('245')[1])).toBe('245')
  })
})

describe('regionNear', () => {
  it('is the segment under a point, the nearest one just outside the skin, and nothing further away', () => {
    const [cx, cy] = shapeCenter(shapeOf('female', REGION_BY_ID['152']))
    expect(regionNear('female', 'front', cx, cy, 6)).toBe('152')
    // Just outside the patient's right hand (front 145, drawn at the left edge) is air within reach; far out is not.
    const hand = shapeOf('female', REGION_BY_ID['145'])
    const [left, hy] = hand.points.reduce((a, p) => (p[0] < a[0] ? p : a))
    expect(regionNear('female', 'front', left - 3, hy, 6)).toBe('145')
    expect(regionNear('female', 'front', left - 30, hy, 6)).toBeNull()
  })
})

describe('partition', () => {
  it('cuts a gesture at every border into pieces tagged with their region, meeting on the border', () => {
    const pieces = partition(line('152', '160'))
    expect(regionsOf(pieces)).toEqual(['152', '154', '160'])
    expect(first(pieces[0])).toEqual(centre('152'))
    expect(last(pieces[2])).toEqual(centre('160'))
    // Consecutive pieces end and start within a hair of the border, each on its own side of it.
    for (let i = 0; i + 1 < pieces.length; i++) {
      const [ax, ay] = last(pieces[i])
      const [bx, by] = first(pieces[i + 1])
      expect(Math.hypot(bx - ax, by - ay)).toBeLessThanOrEqual(0.25)
    }
    for (const p of pieces) for (const [x, y] of p.points) expect(regionAt(F, 'front', x, y), p.region).toBe(p.region)
  })

  it('a dot is one piece; an empty gesture none', () => {
    expect(partition(dot('110'))).toEqual([piece('110')])
    expect(partition({ fig: F, view: 'front', points: [], w: BRUSH })).toEqual([])
  })

  it('drops a graze shorter than a brush width, keeps a real crossing', () => {
    expect(regionsOf(partition(into('152', '154', 3)))).toEqual(['152'])
    expect(regionsOf(partition(into('152', '154', BRUSH + 2)))).toEqual(['152', '154'])
  })

  it('keeps the longest piece however short, so a gesture always paints something', () => {
    const [x, y] = centre('152')
    expect(regionsOf(partition({ fig: F, view: 'front', points: [[x, y], [x + 2, y + 1]], w: BRUSH }))).toEqual(['152'])
  })

  it('simplifies the points of each piece', () => {
    const [ax, ay] = centre('152')
    const wobble: RawStroke = { fig: F, view: 'front', points: [[ax, ay], [ax + 2, ay + 0.2], [ax + 4, ay]], w: BRUSH }
    expect(partition(wobble)[0].points).toEqual([[ax, ay], [ax + 4, ay]])
  })

  it('reads the gesture on the figure it was drawn on', () => {
    expect(partition(dot('261', 'male'))).toEqual([piece('261', 'male')])
  })
})

describe('simplify', () => {
  it('keeps the ends, drops points on the line, keeps a corner', () => {
    expect(simplify([[0, 0], [1, 0.1], [2, 0], [3, 0.2], [4, 0]])).toEqual([[0, 0], [4, 0]])
    expect(simplify([[0, 0], [4, 0], [4, 4]])).toEqual([[0, 0], [4, 0], [4, 4]])
    expect(simplify([[1, 1]])).toEqual([[1, 1]])
  })
})

describe('addStroke', () => {
  it('paints the current layer: its pieces and their regions join it', () => {
    const s = addStroke(empty, line('152', '160'))
    expect(s.layers).toHaveLength(1)
    expect(s.layers[0].regions).toEqual(['152', '154', '160'])
    expect(s.layers[0].readings).toEqual({ pain: 6 })
    expect(regionsOf(s.layers[0].strokes!)).toEqual(['152', '154', '160'])
    expect(s.cur).toBe(0)
    expect(addStroke(empty, { fig: F, view: 'front', points: [], w: BRUSH })).toEqual(empty)
    expect(addStroke({ layers: [], cur: 0 }, dot('152'))).toEqual({ layers: [], cur: 0 })
  })

  it('never touches another layer: the same region can be painted in two', () => {
    let s = addStroke(empty, dot('152'))
    s = { layers: [...s.layers, L(['110'], 3)], cur: 1 }
    s = addStroke(s, dot('152'))
    expect(s.layers).toEqual([L(['152'], 6, [piece('152')]), L(['110', '152'], 3, [piece('152')])])
    expect(s.cur).toBe(1)
  })

  it('leaves full body alone but keeps the paint, mind included', () => {
    const full = addStroke({ layers: [L(['*', 'mind'], 4)], cur: 0 }, dot('110'))
    expect(full.layers).toEqual([L(['*', 'mind'], 4, [piece('110')])])
  })
})

describe('paint follows its region', () => {
  it('a tap on a painted region in the current layer removes it with its paint', () => {
    let s = addStroke(empty, line('152', '160'))
    s = tapRegion(s, '154', false)
    expect(s.layers[0].regions).toEqual(['152', '160'])
    expect(regionsOf(s.layers[0].strokes!)).toEqual(['152', '160'])
    // Mirror takes the other side too, paint included.
    s = addStroke(s, dot('153'))
    s = tapRegion(s, '152', true)
    expect(s.layers[0].regions).toEqual(['160'])
    expect(regionsOf(s.layers[0].strokes!)).toEqual(['160'])
  })

  it('a tap in another layer adds the region there without taking the paint from the first; a set comes off with its paint', () => {
    let s = addStroke(empty, line('152', '160'))
    s = { layers: [...s.layers, L([], 2)], cur: 1 }
    s = tapRegion(s, '154', false)
    expect(regionsOf(s.layers[0].strokes!)).toEqual(['152', '154', '160'])
    expect(s.layers[1]).toEqual(L(['154'], 2))
    s = tapSet({ ...s, cur: 0 }, ['152', '154'])
    expect(regionsOf(s.layers[0].strokes!)).toEqual(['160'])
    expect(s.layers[0].regions).toEqual(['160'])
  })

  it("full body keeps the layer's paint; a layer without paint gets no strokes key", () => {
    const s = addStroke(empty, dot('152'))
    expect(toggleFull(s).layers).toEqual([L(['*'], 6, [piece('152')])])
    expect(tapRegion(empty, '110', false).layers[0]).not.toHaveProperty('strokes')
  })
})

describe('undoStroke / clearStrokes / pieceCount', () => {
  it('take pieces off the current layer and keep its regions', () => {
    let s = addStroke(empty, line('152', '160'))
    s = addStroke(s, dot('110'))
    expect(pieceCount(s.layers)).toBe(4)
    s = undoStroke(s)
    expect(s.layers[0].regions).toEqual(['110', '152', '154', '160'])
    expect(regionsOf(s.layers[0].strokes!)).toEqual(['152', '154', '160'])
    s = undoStroke(s, 3)
    expect(s.layers[0]).toEqual(L(['110', '152', '154', '160'], 6, []))
    expect(undoStroke(s)).toEqual(s)
    expect(clearStrokes(addStroke(s, dot('110'))).layers[0].strokes).toEqual([])
    expect(undoStroke(empty)).toEqual(empty)
    expect(clearStrokes(empty)).toEqual(empty)
    expect(pieceCount([L(['110'], 1)])).toBe(0)
  })
})

describe('finalize keeps strokes', () => {
  it('rounds coordinates to a tenth and drops an empty list', () => {
    const layers = finalize([
      L(['152'], 6, [{ region: '152', fig: F, view: 'front', points: [[100.123, 250.678]], w: 8.04 }]),
      L(['110'], 2, []),
    ])
    expect(layers).toEqual([L(['152'], 6, [{ region: '152', fig: F, view: 'front', points: [[100.1, 250.7]], w: 8 }]), L(['110'], 2)])
  })
})

describe('allStrokes and strokePath', () => {
  it('collects every stroke at the level of one symptom, skipping layers without it, and draws dots for single points', () => {
    const a = piece('152')
    const [b] = partition(line('261', '263'))
    const entries = [
      { layers: [L(['152'], 6, [a]), L(['110'], 2)] },
      { layers: [{ regions: ['261'], readings: { pain: 9, swelling: 4 }, tags: [], strokes: [b] }] },
      { layers: [] },
    ]
    expect(allStrokes(entries)).toEqual([{ ...a, intensity: 6 }, { ...b, intensity: 9 }])
    expect(allStrokes(entries, 'swelling')).toEqual([{ ...b, intensity: 4 }])
    expect(strokePath(a)).toBe(`M ${a.points[0][0]} ${a.points[0][1]} l 0.01 0`)
    expect(strokePath(b)).toBe(`M ${b.points[0][0]} ${b.points[0][1]} L ${b.points[1][0]} ${b.points[1][1]}`)
    expect(strokePath({ points: [] })).toBe('')
  })
})

describe('zoom helpers', () => {
  it('clientToFigure inverts the pan and zoom of a pixel-sized viewBox', () => {
    expect(clientToFigure({ left: 10, top: 20 }, { k: 2, tx: -50, ty: -100 }, 160, 220)).toEqual([100, 150])
  })

  it('figureCenter is the centroid of the current regions on that view, else the middle of the figure', () => {
    const [x, y] = centre('152')
    expect(figureCenter(F, ['152', '261'], 'front')).toEqual({ x, y })
    const box = figureBox(F)
    expect(figureCenter(F, ['152'], 'back')).toEqual({ x: box.w / 2, y: box.h / 2 })
    expect(figureCenter(F, ['*'], 'front')).toEqual({ x: box.w / 2, y: box.h / 2 })
  })

  it('mainView is the view holding most of the regions, front on a tie or with none', () => {
    expect(mainView(['260', '261', '152'])).toBe('back')
    expect(mainView(['260', '152'])).toBe('front')
    expect(mainView([])).toBe('front')
    expect(mainView(['*'])).toBe('front')
  })
})
