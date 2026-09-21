import { describe, it, expect } from 'vitest'
import { regionAt, partition, simplify, addStroke, undoStroke, clearStrokes, pieceCount, allStrokes, strokePath, clientToFigure, figureCenter, mainView, BRUSH, type RawStroke } from './strokes'
import { finalize, tapRegion, tapSet, toggleFull, type Stroke } from './areas'
import { REGION_BY_ID, shapeOf, shapeCenter, figureBox, type FigureId } from './regions'

const F: FigureId = 'female'
const centre = (id: string, fig: FigureId = F): [number, number] => shapeCenter(shapeOf(fig, REGION_BY_ID[id]))
const viewOf = (id: string) => REGION_BY_ID[id].view
/** A gesture: a dot at the centre of a region, or a line between two centres. */
const dot = (id: string, fig: FigureId = F): RawStroke => ({ fig, view: viewOf(id), points: [centre(id, fig)], w: BRUSH })
const line = (a: string, b: string): RawStroke => ({ fig: F, view: viewOf(a), points: [centre(a), centre(b)], w: BRUSH })
/** The piece a dot becomes. */
const piece = (id: string, fig: FigureId = F): Stroke => ({ region: id, ...dot(id, fig) })
const empty = { areas: [], cur: 0 }
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
  it('creates the first area with the brush level, its pieces and their regions', () => {
    const s = addStroke(empty, line('152', '160'), 6)
    expect(s.areas).toHaveLength(1)
    expect(s.areas[0].regions).toEqual(['152', '154', '160'])
    expect(s.areas[0].intensity).toBe(6)
    expect(regionsOf(s.areas[0].strokes!)).toEqual(['152', '154', '160'])
    expect(s.cur).toBe(0)
    expect(addStroke(empty, { fig: F, view: 'front', points: [], w: BRUSH }, 6)).toEqual(empty)
  })

  it('pulls painted regions out of other areas with their paint; an area emptied of regions goes', () => {
    let s = addStroke(empty, dot('152'), 8)
    s = { areas: [...s.areas, { regions: ['110'], intensity: 3 }], cur: 1 }
    s = addStroke(s, dot('152'), 3)
    expect(s.areas).toEqual([{ regions: ['110', '152'], intensity: 3, strokes: [piece('152'), piece('152')] }])
    expect(s.cur).toBe(0)
  })

  it('leaves full body alone but keeps the paint', () => {
    const full = addStroke({ areas: [{ regions: ['*'], intensity: 4 }], cur: 0 }, dot('110'), 4)
    expect(full.areas).toEqual([{ regions: ['*'], intensity: 4, strokes: [piece('110')] }])
  })

  it('lands in the current area even when it holds only the mind, the area taking the brush level', () => {
    const mindCur = { areas: [{ regions: ['110'], intensity: 4 }, { regions: ['mind'], intensity: 7 }], cur: 1 }
    const s = addStroke(mindCur, dot('152'), 9)
    expect(s.areas).toEqual([{ regions: ['110'], intensity: 4 }, { regions: ['152', 'mind'], intensity: 9, strokes: [piece('152')] }])
    expect(s.cur).toBe(1)
    const mindOnly = addStroke({ areas: [{ regions: ['mind'], intensity: 7 }], cur: 0 }, dot('152'), 9)
    expect(mindOnly.areas).toEqual([{ regions: ['152', 'mind'], intensity: 9, strokes: [piece('152')] }])
    expect(mindOnly.cur).toBe(0)
  })
})

describe('paint follows its region', () => {
  it('a tap on a painted region in the current area removes it with its paint', () => {
    let s = addStroke(empty, line('152', '160'), 6)
    s = tapRegion(s, '154', false, 6)
    expect(s.areas[0].regions).toEqual(['152', '160'])
    expect(regionsOf(s.areas[0].strokes!)).toEqual(['152', '160'])
    // Mirror takes the other side too, paint included.
    s = addStroke(s, dot('153'), 6)
    s = tapRegion(s, '152', true, 6)
    expect(s.areas[0].regions).toEqual(['160'])
    expect(regionsOf(s.areas[0].strokes!)).toEqual(['160'])
  })

  it('a tap or a set that moves a region to another area moves its paint along', () => {
    let s = addStroke(empty, line('152', '160'), 6)
    s = { areas: [...s.areas, { regions: [], intensity: 2 }], cur: 1 }
    s = tapRegion(s, '154', false, 2)
    expect(regionsOf(s.areas[0].strokes!)).toEqual(['152', '160'])
    expect(s.areas[1]).toEqual({ regions: ['154'], intensity: 2, strokes: [expect.objectContaining({ region: '154' })] })
    s = tapSet({ ...s, cur: 0 }, ['154', '155'], 6)
    expect(regionsOf(s.areas[0].strokes!)).toEqual(['152', '160', '154'])
    expect(s.areas).toHaveLength(1)
    // A set fully in the current area comes off with its paint.
    s = tapSet(s, ['152', '154'], 6)
    expect(regionsOf(s.areas[0].strokes!)).toEqual(['160'])
  })

  it('full body keeps the body areas\' paint; an area without paint gets no strokes key', () => {
    const s = addStroke(empty, dot('152'), 6)
    expect(toggleFull(s, 6).areas).toEqual([{ regions: ['*'], intensity: 6, strokes: [piece('152')] }])
    expect(tapRegion(empty, '110', false, 5).areas[0]).not.toHaveProperty('strokes')
  })
})

describe('undoStroke / clearStrokes / pieceCount', () => {
  it('take pieces off the current area and keep its regions', () => {
    let s = addStroke(empty, line('152', '160'), 6)
    s = addStroke(s, dot('110'), 6)
    expect(pieceCount(s.areas)).toBe(4)
    s = undoStroke(s)
    expect(s.areas[0].regions).toEqual(['110', '152', '154', '160'])
    expect(regionsOf(s.areas[0].strokes!)).toEqual(['152', '154', '160'])
    s = undoStroke(s, 3)
    expect(s.areas[0]).toEqual({ regions: ['110', '152', '154', '160'], intensity: 6, strokes: [] })
    expect(undoStroke(s)).toEqual(s)
    expect(clearStrokes(addStroke(s, dot('110'), 6)).areas[0].strokes).toEqual([])
    expect(undoStroke(empty)).toEqual(empty)
    expect(clearStrokes(empty)).toEqual(empty)
    expect(pieceCount([{ regions: ['110'], intensity: 1 }])).toBe(0)
  })
})

describe('finalize keeps strokes', () => {
  it('rounds coordinates to a tenth and drops an empty list', () => {
    const areas = finalize([
      { regions: ['152'], intensity: 6, strokes: [{ region: '152', fig: F, view: 'front', points: [[100.123, 250.678]], w: 8.04 }] },
      { regions: ['110'], intensity: 2, strokes: [] },
    ])
    expect(areas).toEqual([{ regions: ['152'], intensity: 6, strokes: [{ region: '152', fig: F, view: 'front', points: [[100.1, 250.7]], w: 8 }] }, { regions: ['110'], intensity: 2 }])
  })
})

describe('allStrokes and strokePath', () => {
  it('collects every stroke with its level and draws dots for single points', () => {
    const a = piece('152')
    const [b] = partition(line('261', '263'))
    const entries = [
      { areas: [{ regions: ['152'], intensity: 6, strokes: [a] }, { regions: ['110'], intensity: 2 }] },
      { areas: [{ regions: ['261'], intensity: 9, strokes: [b] }] },
      { areas: [] },
    ]
    expect(allStrokes(entries)).toEqual([{ ...a, intensity: 6 }, { ...b, intensity: 9 }])
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
