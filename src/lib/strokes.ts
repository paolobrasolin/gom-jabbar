import { REGION_BY_ID, regionsFor, shapeOf, shapeArea, shapeCenter, shapeContains, figureBox, isFullBody, type FigureId, type Shape, type View } from './regions'
import { prune, type Area, type AreaState, type Stroke } from './areas'

export type { Stroke }

/** Brush width in figure units: about a fingertip on the zoomed figure, a fat dot on the small one. */
export const BRUSH = 8

/** A stroke with the level of the area it belongs to, for shading a heatmap. */
export type HeatStroke = Stroke & { intensity: number }

const sortU = (xs: string[]) => [...new Set(xs)].sort()

function segmentDistance(x: number, y: number, [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
}

/** Distance from a point outside the shape to its edge. */
function distance(s: Shape, x: number, y: number): number {
  if (s.kind === 'ellipse') return (Math.hypot((x - s.cx) / s.rx, (y - s.cy) / s.ry) - 1) * Math.min(s.rx, s.ry)
  let best = Infinity
  const pts = s.points
  for (let i = 0; i < pts.length; i++) best = Math.min(best, segmentDistance(x, y, pts[i], pts[(i + 1) % pts.length]))
  return best
}

/** The region under a point of a figure: the smallest one containing it, else the nearest. */
export function regionAt(fig: FigureId, view: View, x: number, y: number): string {
  const regs = regionsFor(view).map((r) => ({ id: r.id, shape: shapeOf(fig, r) }))
  const hit = regs.filter((r) => shapeContains(r.shape, x, y)).sort((a, b) => shapeArea(a.shape) - shapeArea(b.shape))[0]
  if (hit) return hit.id
  let best = regs[0]
  let bd = Infinity
  for (const r of regs) {
    const d = distance(r.shape, x, y)
    if (d < bd) {
      bd = d
      best = r
    }
  }
  return best.id
}

const STEP = 4

/** Every region a stroke passes over, sampling its segments so a fast swipe skips none. */
export function regionsAlong(stroke: Stroke): string[] {
  const ids: string[] = []
  const pts = stroke.points
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]
    ids.push(regionAt(stroke.fig, stroke.view, ax, ay))
    if (i + 1 >= pts.length) continue
    const [bx, by] = pts[i + 1]
    const n = Math.floor(Math.hypot(bx - ax, by - ay) / STEP)
    for (let k = 1; k <= n; k++) ids.push(regionAt(stroke.fig, stroke.view, ax + ((bx - ax) * k) / (n + 1), ay + ((by - ay) * k) / (n + 1)))
  }
  return sortU(ids)
}

/** Ramer–Douglas–Peucker: drop the points a straight line already explains. */
export function simplify(points: [number, number][], tol = 0.8): [number, number][] {
  if (points.length < 3) return points
  let worst = 0
  let at = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = segmentDistance(points[i][0], points[i][1], points[0], points[points.length - 1])
    if (d > worst) {
      worst = d
      at = i
    }
  }
  if (worst <= tol) return [points[0], points[points.length - 1]]
  return [...simplify(points.slice(0, at + 1), tol).slice(0, -1), ...simplify(points.slice(at), tol)]
}

/** Add a stroke to the current area and pull in the regions it crosses, like taps would. Mirror never applies. */
export function addStroke(state: AreaState, stroke: Stroke, brush: number): AreaState {
  let { areas, cur } = state
  if (areas.length === 0) {
    areas = [{ regions: [], intensity: brush }]
    cur = 0
  }
  const s = { ...stroke, points: simplify(stroke.points) }
  const ids = regionsAlong(s)
  const full = isFullBody(areas[cur].regions)
  const next = areas.map((a, i) => {
    if (i === cur) return { ...a, regions: full ? a.regions : sortU([...a.regions, ...ids]), strokes: [...(a.strokes ?? []), s] }
    return full ? a : { ...a, regions: a.regions.filter((r) => !ids.includes(r)) }
  })
  return prune({ areas: next, cur })
}

const withStrokes = (state: AreaState, strokes: Stroke[]): AreaState => ({
  ...state,
  areas: state.areas.map((a, j) => (j === state.cur ? { ...a, strokes } : a)),
})

/** Take back the current area's last stroke. The regions it pulled in stay: they may have been tapped too. */
export function undoStroke(state: AreaState): AreaState {
  const a = state.areas[state.cur]
  if (!a?.strokes?.length) return state
  return withStrokes(state, a.strokes.slice(0, -1))
}

/** Remove every stroke of the current area. */
export function clearStrokes(state: AreaState): AreaState {
  const a = state.areas[state.cur]
  if (!a?.strokes?.length) return state
  return withStrokes(state, [])
}

/** Every stroke of every area, with its level, for one figure of shading. */
export function allStrokes(entries: { areas: Area[] }[]): HeatStroke[] {
  return entries.flatMap((e) => e.areas.flatMap((a) => (a.strokes ?? []).map((s) => ({ ...s, intensity: a.intensity }))))
}

/** SVG path of a stroke. A single point becomes a dot, thanks to round caps. */
export function strokePath(stroke: Stroke): string {
  const [first, ...rest] = stroke.points
  if (!first) return ''
  if (!rest.length) return `M ${first[0]} ${first[1]} l 0.01 0`
  return `M ${first[0]} ${first[1]} ` + rest.map(([x, y]) => `L ${x} ${y}`).join(' ')
}

export type ZoomView = { k: number; tx: number; ty: number }
type Rect = { left: number; top: number }

/** Figure coordinates of a client point on a zoomed svg whose viewBox is its pixel size and whose figure is drawn under `translate(tx ty) scale(k)`. */
export function clientToFigure(rect: Rect, { k, tx, ty }: ZoomView, cx: number, cy: number): [number, number] {
  return [(cx - rect.left - tx) / k, (cy - rect.top - ty) / k]
}

/** Where to look first: the centroid of these regions on the view, or the middle of the figure. */
export function figureCenter(fig: FigureId, regions: string[], view: View): { x: number; y: number } {
  const own = regions.map((id) => REGION_BY_ID[id]).filter((r) => r?.view === view)
  const box = figureBox(fig)
  if (!own.length) return { x: box.w / 2, y: box.h / 2 }
  const cs = own.map((r) => shapeCenter(shapeOf(fig, r)))
  return { x: cs.reduce((t, c) => t + c[0], 0) / cs.length, y: cs.reduce((t, c) => t + c[1], 0) / cs.length }
}

/** The view holding most of these regions; front on a tie. */
export function mainView(regions: string[]): View {
  const n = (v: View) => regions.filter((id) => REGION_BY_ID[id]?.view === v).length
  return n('back') > n('front') ? 'back' : 'front'
}
