import { describe, it, expect } from 'vitest'
import { regionAt, regionsAlong, simplify, addStroke, undoStroke, clearStrokes, allStrokes, strokePath, clientToFigure, figureCenter, mainView, BRUSH, type Stroke } from './strokes'
import { finalize } from './areas'
import { REGION_BY_ID, shapeOf, shapeCenter, figureBox, type FigureId } from './regions'

const F: FigureId = 'female'
const centre = (id: string, fig: FigureId = F): [number, number] => shapeCenter(shapeOf(fig, REGION_BY_ID[id]))
const viewOf = (id: string) => REGION_BY_ID[id].view
const dot = (id: string, fig: FigureId = F): Stroke => ({ fig, view: viewOf(id), points: [centre(id, fig)], w: BRUSH })
const line = (a: string, b: string): Stroke => ({ fig: F, view: viewOf(a), points: [centre(a), centre(b)], w: BRUSH })
const empty = { areas: [], cur: 0 }

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

describe('regionsAlong', () => {
  it('collects every region a stroke crosses, sampling long segments', () => {
    expect(regionsAlong(line('152', '160'))).toEqual(['152', '154', '160'])
    expect(regionsAlong(dot('110'))).toEqual(['110'])
    expect(regionsAlong({ fig: F, view: 'front', points: [], w: BRUSH })).toEqual([])
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
  it('creates the first area with the brush level and pulls in the regions crossed', () => {
    const s = addStroke(empty, line('152', '160'), 6)
    expect(s.areas).toEqual([{ regions: ['152', '154', '160'], intensity: 6, strokes: [line('152', '160')] }])
    expect(s.cur).toBe(0)
  })

  it('simplifies the points it stores', () => {
    const [ax, ay] = centre('152')
    const wobble: Stroke = { fig: F, view: 'front', points: [[ax, ay], [ax + 2, ay + 0.2], [ax + 4, ay]], w: BRUSH }
    const s = addStroke(empty, wobble, 6)
    expect(s.areas[0].strokes![0].points).toEqual([[ax, ay], [ax + 4, ay]])
  })

  it('moves crossed regions out of other areas; an area emptied of regions goes, strokes and all', () => {
    let s = addStroke(empty, dot('152'), 8)
    s = { areas: [...s.areas, { regions: ['110'], intensity: 3 }], cur: 1 }
    s = addStroke(s, dot('152'), 3)
    expect(s.areas).toEqual([{ regions: ['110', '152'], intensity: 3, strokes: [dot('152')] }])
    expect(s.cur).toBe(0)
  })

  it('leaves full body alone but keeps the stroke', () => {
    const full = addStroke({ areas: [{ regions: ['*'], intensity: 4 }], cur: 0 }, dot('110'), 4)
    expect(full.areas).toEqual([{ regions: ['*'], intensity: 4, strokes: [dot('110')] }])
  })

  it('reads the stroke on the figure it was drawn on', () => {
    const s = addStroke(empty, dot('261', 'male'), 5)
    expect(s.areas[0].regions).toEqual(['261'])
    expect(s.areas[0].strokes![0].fig).toBe('male')
  })
})

describe('undoStroke / clearStrokes', () => {
  it('take strokes off the current area and keep its regions', () => {
    let s = addStroke(empty, dot('152'), 6)
    s = addStroke(s, dot('154'), 6)
    s = undoStroke(s)
    expect(s.areas[0]).toEqual({ regions: ['152', '154'], intensity: 6, strokes: [dot('152')] })
    expect(clearStrokes(s).areas[0]).toEqual({ regions: ['152', '154'], intensity: 6, strokes: [] })
    expect(undoStroke(undoStroke(s))).toEqual(undoStroke(s))
    expect(undoStroke(empty)).toEqual(empty)
    expect(clearStrokes(empty)).toEqual(empty)
  })
})

describe('finalize keeps strokes', () => {
  it('rounds coordinates to a tenth and drops an empty list', () => {
    const areas = finalize([
      { regions: ['152'], intensity: 6, strokes: [{ fig: F, view: 'front', points: [[100.123, 250.678]], w: 8.04 }] },
      { regions: ['110'], intensity: 2, strokes: [] },
    ])
    expect(areas).toEqual([{ regions: ['152'], intensity: 6, strokes: [{ fig: F, view: 'front', points: [[100.1, 250.7]], w: 8 }] }, { regions: ['110'], intensity: 2 }])
  })
})

describe('allStrokes and strokePath', () => {
  it('collects every stroke with its level and draws dots for single points', () => {
    const a = dot('152')
    const b = line('261', '263')
    const entries = [
      { areas: [{ regions: ['152'], intensity: 6, strokes: [a] }, { regions: ['110'], intensity: 2 }] },
      { areas: [{ regions: ['261'], intensity: 9, strokes: [b] }] },
      { areas: [] },
    ]
    expect(allStrokes(entries)).toEqual([{ ...a, intensity: 6 }, { ...b, intensity: 9 }])
    expect(strokePath(a)).toBe(`M ${a.points[0][0]} ${a.points[0][1]} l 0.01 0`)
    expect(strokePath(b)).toBe(`M ${b.points[0][0]} ${b.points[0][1]} L ${b.points[1][0]} ${b.points[1][1]}`)
    expect(strokePath({ fig: F, view: 'front', points: [], w: 1 })).toBe('')
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
