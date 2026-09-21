import { REGION_BY_ID, regionsFor, shapeOf, shapeArea, shapeCenter, shapeContains, figureBox, isFullBody, type FigureId, type Shape, type View } from './regions'
import { prune, bodyTarget, pullRegions, type Area, type AreaState, type Stroke } from './areas'

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

/** A gesture as drawn, before it is cut into pieces: one figure, one view, the centreline and the brush width. */
export type RawStroke = Omit<Stroke, 'region'>

/** Sampling step along a gesture, in figure units: fine enough that a fast swipe skips no segment. */
const STEP = 4
/** How close to the border a cut lands. */
const CUT = 0.25

type Piece = { region: string; points: [number, number][]; len: number }

/**
 * Cut a gesture at every segment border into pieces, each tagged with its region, so paint never lies
 * outside the segments it selects. Pieces shorter than a brush width are grazes and are dropped, unless
 * nothing longer exists: a dot or a short stroke always yields one piece. Points are simplified per piece.
 */
export function partition(raw: RawStroke): Stroke[] {
  const { fig, view, points, w } = raw
  if (!points.length) return []
  const at = (p: [number, number]) => regionAt(fig, view, p[0], p[1])
  const pieces: Piece[] = []
  let cur: Piece = { region: at(points[0]), points: [points[0]], len: 0 }
  const push = (p: [number, number]) => {
    const last = cur.points[cur.points.length - 1]
    cur.len += Math.hypot(p[0] - last[0], p[1] - last[1])
    cur.points.push(p)
  }
  for (let i = 0; i + 1 < points.length; i++) {
    const end = points[i + 1]
    let a = points[i]
    for (;;) {
      const d = Math.hypot(end[0] - a[0], end[1] - a[1])
      const last = d <= STEP
      const b: [number, number] = last ? end : [a[0] + ((end[0] - a[0]) * STEP) / d, a[1] + ((end[1] - a[1]) * STEP) / d]
      const rb = at(b)
      if (rb !== cur.region) {
        // The border lies between a and b: bisect to it, end the piece just before it and start the next just after,
        // so every point of a piece lies in its region and the round caps close the hairline gap.
        let lo = a
        let hi = b
        while (Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) > CUT) {
          const m: [number, number] = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]
          if (at(m) === cur.region) lo = m
          else hi = m
        }
        push(lo)
        pieces.push(cur)
        cur = { region: rb, points: [hi], len: 0 }
      }
      if (last) {
        push(end)
        break
      }
      a = b
    }
  }
  pieces.push(cur)
  const longest = Math.max(...pieces.map((p) => p.len))
  return pieces.filter((p) => p.len >= w || p.len === longest).map((p) => ({ region: p.region, fig, view, points: simplify(p.points), w }))
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

/**
 * Paint a gesture onto the current body area (never the mind's, §5.4): its pieces join the area and so do
 * their segments, pulled from other areas together with their paint, exactly as taps would. Mirror never applies.
 */
export function addStroke(state: AreaState, raw: RawStroke, brush: number): AreaState {
  const pieces = partition(raw)
  if (!pieces.length) return state
  const ids = sortU(pieces.map((p) => p.region))
  const { areas, cur } = bodyTarget(state, brush)
  const pulled = isFullBody(areas[cur].regions) ? areas : pullRegions(areas, cur, ids)
  const next = pulled.map((a, i) => (i === cur ? { ...a, strokes: [...(a.strokes ?? []), ...pieces] } : a))
  return prune({ areas: next, cur })
}

const withStrokes = (state: AreaState, strokes: Stroke[]): AreaState => ({
  ...state,
  areas: state.areas.map((a, j) => (j === state.cur ? { ...a, strokes } : a)),
})

/** Take back the current area's last `n` pieces (a gesture's worth). The regions stay: they may have been tapped too. */
export function undoStroke(state: AreaState, n = 1): AreaState {
  const a = state.areas[state.cur]
  if (!a?.strokes?.length) return state
  return withStrokes(state, a.strokes.slice(0, -Math.max(1, n)))
}

/** Remove every stroke of the current area. */
export function clearStrokes(state: AreaState): AreaState {
  const a = state.areas[state.cur]
  if (!a?.strokes?.length) return state
  return withStrokes(state, [])
}

/** How many pieces of paint an entry's areas hold: a gesture adds some, a tap may take some away. */
export function pieceCount(areas: Area[]): number {
  return areas.reduce((t, a) => t + (a.strokes?.length ?? 0), 0)
}

/** Every stroke of every area, with its level, for one figure of shading. */
export function allStrokes(entries: { areas: Area[] }[]): HeatStroke[] {
  return entries.flatMap((e) => e.areas.flatMap((a) => (a.strokes ?? []).map((s) => ({ ...s, intensity: a.intensity }))))
}

/** SVG path of a stroke, or of the gesture in progress. A single point becomes a dot, thanks to round caps. */
export function strokePath(stroke: { points: [number, number][] }): string {
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
