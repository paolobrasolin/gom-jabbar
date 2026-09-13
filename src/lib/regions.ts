export const FULL_BODY = '*'
export type View = 'front' | 'back'
export type Side = 'l' | 'r'
export type Group = 'head' | 'arm' | 'torso' | 'back' | 'hip' | 'leg'

export type Shape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'poly'; points: [number, number][]; r: number }

export type RegionDef = {
  id: string
  view: View
  group: Group
  side?: Side
  shape: Shape
}

export const VIEWBOX = { w: 170, h: 420 }

const ell = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: 'ellipse', cx, cy, rx, ry })
const poly = (r: number, ...points: [number, number][]): Shape => ({ kind: 'poly', points, r })

function mirror(s: Shape): Shape {
  return s.kind === 'ellipse'
    ? { ...s, cx: VIEWBOX.w - s.cx }
    : { ...s, points: s.points.map(([x, y]) => [VIEWBOX.w - x, y] as [number, number]) }
}

/** SVG path for a polygon with rounded corners. */
export function pathFor(s: Shape): string {
  if (s.kind === 'ellipse') {
    const { cx, cy, rx, ry } = s
    return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`
  }
  const pts = s.points
  const n = pts.length
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const cur = pts[i]
    const next = pts[(i + 1) % n]
    const toward = (a: [number, number], b: [number, number]) => {
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len = Math.hypot(dx, dy)
      const d = Math.min(s.r, len / 2)
      return [a[0] + (dx / len) * d, a[1] + (dy / len) * d]
    }
    const [ax, ay] = toward(cur, prev)
    const [bx, by] = toward(cur, next)
    parts.push(`${i === 0 ? 'M' : 'L'} ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${cur[0]} ${cur[1]} ${bx.toFixed(1)} ${by.toFixed(1)}`)
  }
  return parts.join(' ') + ' Z'
}

export function shapeArea(s: Shape): number {
  if (s.kind === 'ellipse') return Math.PI * s.rx * s.ry
  let a = 0
  for (let i = 0; i < s.points.length; i++) {
    const [x1, y1] = s.points[i]
    const [x2, y2] = s.points[(i + 1) % s.points.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

export function shapeCenter(s: Shape): [number, number] {
  if (s.kind === 'ellipse') return [s.cx, s.cy]
  const n = s.points.length
  return [s.points.reduce((t, p) => t + p[0], 0) / n, s.points.reduce((t, p) => t + p[1], 0) / n]
}

/** Base shapes drawn on the viewer's left (x < 85). Sided ones get mirrored. Tapered limbs, chunky enough to tap. */
type Base = { id: string; group: Group; shape: Shape; sided?: boolean }

const C = VIEWBOX.w / 2

// Shared limb geometry (viewer-left side).
const SHOULDER = poly(9, [26, 88], [60, 79], [62, 100], [32, 108])
const UPPERARM = poly(10, [20, 110], [47, 104], [44, 166], [22, 168])
const ELBOW = ell(33, 174, 14, 10)
const FOREARM = poly(10, [20, 182], [44, 182], [40, 242], [24, 242])
const HAND = ell(32, 260, 14, 18)
const HIP = poly(10, [52, 192], [C, 192], [C, 226], [50, 228])
const THIGH = poly(12, [52, 230], [C - 1, 230], [C - 3, 306], [56, 306])
const KNEE = ell(69, 316, 15, 11)
const SHIN = poly(10, [57, 328], [81, 328], [78, 384], [60, 384])
const ANKLE = ell(69, 392, 12, 8)
const FOOT = poly(6, [46, 401], [82, 401], [82, 420], [40, 420])

const FRONT: Base[] = [
  { id: 'head', group: 'head', shape: ell(C, 27, 23, 27) },
  { id: 'neck', group: 'head', shape: poly(5, [C - 11, 54], [C + 11, 54], [C + 15, 76], [C - 15, 76]) },
  { id: 'shoulder', group: 'arm', shape: SHOULDER, sided: true },
  { id: 'chest', group: 'torso', shape: poly(10, [C - 27, 78], [C + 27, 78], [C + 25, 138], [C - 25, 138]) },
  { id: 'abdomen', group: 'torso', shape: poly(10, [C - 25, 140], [C + 25, 140], [C + 27, 190], [C - 27, 190]) },
  { id: 'upperarm', group: 'arm', shape: UPPERARM, sided: true },
  { id: 'elbow', group: 'arm', shape: ELBOW, sided: true },
  { id: 'forearm', group: 'arm', shape: FOREARM, sided: true },
  { id: 'hand', group: 'arm', shape: HAND, sided: true },
  { id: 'hip', group: 'hip', shape: HIP, sided: true },
  { id: 'thigh', group: 'leg', shape: THIGH, sided: true },
  { id: 'knee', group: 'leg', shape: KNEE, sided: true },
  { id: 'shin', group: 'leg', shape: SHIN, sided: true },
  { id: 'ankle', group: 'leg', shape: ANKLE, sided: true },
  { id: 'foot', group: 'leg', shape: FOOT, sided: true },
]

const BACK: Base[] = [
  { id: 'head.back', group: 'head', shape: ell(C, 27, 23, 27) },
  { id: 'neck.back', group: 'head', shape: poly(5, [C - 11, 54], [C + 11, 54], [C + 15, 76], [C - 15, 76]) },
  { id: 'shoulder.back', group: 'arm', shape: SHOULDER, sided: true },
  { id: 'upperback', group: 'back', shape: poly(10, [C - 27, 78], [C + 27, 78], [C + 25, 146], [C - 25, 146]) },
  { id: 'lowerback', group: 'back', shape: poly(10, [C - 25, 148], [C + 25, 148], [C + 27, 190], [C - 27, 190]) },
  { id: 'upperarm.back', group: 'arm', shape: UPPERARM, sided: true },
  { id: 'elbow.back', group: 'arm', shape: ELBOW, sided: true },
  { id: 'forearm.back', group: 'arm', shape: FOREARM, sided: true },
  { id: 'hand', group: 'arm', shape: HAND, sided: true },
  { id: 'buttock', group: 'hip', shape: HIP, sided: true },
  { id: 'thigh.back', group: 'leg', shape: THIGH, sided: true },
  { id: 'knee.back', group: 'leg', shape: KNEE, sided: true },
  { id: 'calf', group: 'leg', shape: SHIN, sided: true },
  { id: 'heel', group: 'leg', shape: ANKLE, sided: true },
  { id: 'foot.back', group: 'leg', shape: FOOT, sided: true },
]

function expand(bases: Base[], view: View): RegionDef[] {
  // Front view: the figure's right side is on the viewer's left.
  // Back view: the figure's left side is on the viewer's left.
  const leftOfViewer: Side = view === 'front' ? 'r' : 'l'
  const rightOfViewer: Side = view === 'front' ? 'l' : 'r'
  return bases.flatMap((b) => {
    if (!b.sided) return [{ id: b.id, view, group: b.group, shape: b.shape }]
    return [
      { id: `${b.id}.${leftOfViewer}`, view, group: b.group, side: leftOfViewer, shape: b.shape },
      { id: `${b.id}.${rightOfViewer}`, view, group: b.group, side: rightOfViewer, shape: mirror(b.shape) },
    ]
  })
}

export const REGIONS: RegionDef[] = [...expand(FRONT, 'front'), ...expand(BACK, 'back')]
export const REGION_BY_ID: Record<string, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.id, r]))
export const ALL_REGION_IDS = REGIONS.map((r) => r.id)

export function regionsFor(view: View): RegionDef[] {
  return REGIONS.filter((r) => r.view === view)
}


export function mirrorId(id: string): string | null {
  if (id.endsWith('.l')) return id.slice(0, -2) + '.r'
  if (id.endsWith('.r')) return id.slice(0, -2) + '.l'
  return null
}

export const LEG_IDS = REGIONS.filter((r) => r.group === 'leg' || r.group === 'hip').map((r) => r.id)
export const ARM_IDS = REGIONS.filter((r) => r.group === 'arm').map((r) => r.id)

/** All regions in the same group and on the same side as `id` (whole limb, whole torso, whole head), both views. */
export function limbOf(id: string): string[] {
  const def = REGION_BY_ID[id]
  if (!def) return [id]
  const groups: Group[] = def.group === 'hip' ? ['hip', 'leg'] : def.group === 'leg' ? ['hip', 'leg'] : [def.group]
  return [...new Set(REGIONS.filter((r) => groups.includes(r.group) && r.side === def.side).map((r) => r.id))].sort()
}

export function isFullBody(regions: string[]): boolean {
  return regions.includes(FULL_BODY)
}

/** Toggle a region, honouring the mirror setting. Returns a new array. */
export function toggleRegion(selected: string[], id: string, mirror: boolean): string[] {
  if (isFullBody(selected)) return selected
  const ids = [id]
  const m = mirror ? mirrorId(id) : null
  if (m) ids.push(m)
  const set = new Set(selected)
  const on = set.has(id)
  for (const x of ids) on ? set.delete(x) : set.add(x)
  return [...set].sort()
}

/** Toggle a whole set (legs, arms). If all present, remove them; else add them all. */
export function toggleSet(selected: string[], ids: string[]): string[] {
  if (isFullBody(selected)) return selected
  const set = new Set(selected)
  const all = ids.every((x) => set.has(x))
  for (const x of ids) all ? set.delete(x) : set.add(x)
  return [...set].sort()
}

export function toggleFullBody(selected: string[]): string[] {
  return isFullBody(selected) ? [] : [FULL_BODY]
}

export type RegionSummaryItem = { group: Group | 'full'; side: 'both' | Side | 'none' }

/** Collapse region ids into coarse groups with side info, for display. */
export function summarizeRegions(regions: string[]): RegionSummaryItem[] {
  if (isFullBody(regions)) return [{ group: 'full', side: 'none' }]
  const order: Group[] = ['head', 'arm', 'torso', 'back', 'hip', 'leg']
  const sides = new Map<Group, Set<Side | 'none'>>()
  for (const id of regions) {
    const def = REGION_BY_ID[id]
    if (!def) continue
    if (!sides.has(def.group)) sides.set(def.group, new Set())
    sides.get(def.group)!.add(def.side ?? 'none')
  }
  return order
    .filter((g) => sides.has(g))
    .map((g) => {
      const s = sides.get(g)!
      const side: RegionSummaryItem['side'] = s.has('l') && s.has('r') ? 'both' : s.has('l') ? 'l' : s.has('r') ? 'r' : 'none'
      return { group: g, side }
    })
}
