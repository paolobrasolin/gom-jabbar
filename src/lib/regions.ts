import { FIGURES, FIGURE_SIZE, type FigureId } from './figures'

export type { FigureId }
export const FULL_BODY = '*'
/**
 * The mind (§5.3): a figure beside the body, selectable like a region and stored as one, where the
 * mind symptoms live. Not a CHOIR segment, no side, no view; it shares an area with the body (§5.4).
 */
export const MIND = 'mind'
export const isMind = (id: string): boolean => id === MIND
/** The mind figure, a brain seen from above with lobed edges and a central fissure: the outline and the seams drawn over it, in a 120×100 box. */
export const MIND_SHAPE = {
  w: 120,
  h: 100,
  outline: 'M 60 10 C 66 4 78 6 82 12 C 92 8 104 16 102 26 C 112 30 116 44 108 50 C 116 60 108 74 98 74 C 98 86 84 92 76 86 C 70 96 60 94 60 88 C 60 94 50 96 44 86 C 36 92 22 86 22 74 C 12 74 4 60 12 50 C 4 44 8 30 18 26 C 16 16 28 8 38 12 C 42 6 54 4 60 10 Z',
  seams: 'M 60 12 C 57 30 63 60 60 88 M 30 36 C 38 30 46 36 42 46 M 26 60 C 34 54 44 60 38 70 M 90 36 C 82 30 74 36 78 46 M 94 60 C 86 54 76 60 82 70 M 44 22 C 50 26 50 34 44 36 M 76 22 C 70 26 70 34 76 36',
}
export type View = 'front' | 'back'
export type Side = 'l' | 'r'
/** Display groups, for summaries and the limb shortcuts. */
export type Group = 'head' | 'arm' | 'torso' | 'back' | 'hip' | 'leg'

export type Shape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'poly'; points: [number, number][]; r: number }

/**
 * A region id is a three-digit code (§5.3): view (1 front, 2 back), part family
 * (0 head, 1 front trunk, 2 back trunk, 3 upper arm, 4 lower arm, 5 upper leg, 6 lower leg),
 * then the part top to bottom with the parity giving the side: even left, odd right.
 * Every region is one segment of the CHOIR body map; `choir` is its code there.
 */
export type RegionDef = {
  id: string
  view: View
  group: Group
  side: Side
  /** i18n key suffix: `reg.<name>`. */
  name: string
  choir: number
}

/** Corner rounding applied to the traced polygons when drawn. */
const ROUND = 2

/** Pair rows: our code prefix (two digits), name, display group, and the CHOIR pair as [viewer's left, viewer's right]. */
type Pair = [prefix: string, name: string, group: Group, choir: [number, number]]

const FRONT: Pair[] = [
  ['10', 'head', 'head', [101, 102]],
  ['10', 'face', 'head', [103, 104]],
  ['10', 'neck', 'head', [105, 106]],
  ['11', 'chest', 'torso', [108, 109]],
  ['11', 'abdomen', 'torso', [116, 117]],
  ['11', 'groin', 'torso', [121, 122]],
  ['13', 'shoulder', 'arm', [107, 110]],
  ['13', 'upperarm', 'arm', [111, 112]],
  ['13', 'elbow', 'arm', [113, 114]],
  ['14', 'forearm', 'arm', [115, 118]],
  ['14', 'wrist', 'arm', [119, 124]],
  ['14', 'hand', 'arm', [125, 128]],
  ['15', 'hip', 'hip', [120, 123]],
  ['15', 'thigh', 'leg', [126, 127]],
  ['15', 'knee', 'leg', [129, 130]],
  ['16', 'shin', 'leg', [131, 132]],
  ['16', 'ankle', 'leg', [133, 134]],
  ['16', 'foot', 'leg', [135, 136]],
]
const BACK: Pair[] = [
  ['20', 'head.back', 'head', [201, 202]],
  ['20', 'nape', 'head', [203, 204]],
  ['20', 'neck.back', 'head', [205, 206]],
  ['22', 'upperback', 'back', [208, 209]],
  ['22', 'midback', 'back', [212, 213]],
  ['22', 'lowerback', 'back', [218, 219]],
  ['22', 'buttock', 'hip', [223, 224]],
  ['23', 'shoulder.back', 'arm', [207, 210]],
  ['23', 'upperarm.back', 'arm', [211, 214]],
  ['23', 'elbow.back', 'arm', [215, 216]],
  ['24', 'forearm.back', 'arm', [217, 220]],
  ['24', 'wrist.back', 'arm', [221, 226]],
  ['24', 'hand.back', 'arm', [227, 230]],
  ['25', 'hip.back', 'hip', [222, 225]],
  ['25', 'thigh.back', 'leg', [228, 229]],
  ['25', 'knee.back', 'leg', [231, 232]],
  ['26', 'calf', 'leg', [233, 234]],
  ['26', 'heel', 'leg', [235, 236]],
  ['26', 'foot.back', 'leg', [237, 238]],
]

function expand(pairs: Pair[], view: View): RegionDef[] {
  const next: Record<string, number> = {}
  return pairs.flatMap(([prefix, name, group, choir]) => {
    const n = next[prefix] ?? 0
    next[prefix] = n + 2
    // The CHOIR pair is viewer's left first: the figure's right in front, its left at the back.
    const [leftCode, rightCode] = view === 'front' ? [choir[1], choir[0]] : choir
    return [
      { id: `${prefix}${n}`, view, group, side: 'l' as Side, name, choir: leftCode },
      { id: `${prefix}${n + 1}`, view, group, side: 'r' as Side, name, choir: rightCode },
    ]
  })
}

export const REGIONS: RegionDef[] = [...expand(FRONT, 'front'), ...expand(BACK, 'back')]
export const REGION_BY_ID: Record<string, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.id, r]))
export const ALL_REGION_IDS = REGIONS.map((r) => r.id)

export function regionsFor(view: View): RegionDef[] {
  return REGIONS.filter((r) => r.view === view)
}

/** The region's polygon on one of the figures. */
export function shapeOf(fig: FigureId, r: RegionDef): Shape {
  return { kind: 'poly', points: FIGURES[fig][r.view][String(r.choir)], r: ROUND }
}

/** The viewBox of a figure, both views. */
export function figureBox(fig: FigureId): { w: number; h: number } {
  return FIGURE_SIZE[fig]
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
      const len = Math.hypot(dx, dy) || 1
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

/** Point in shape. Polygons are tested on their corners; the rounding is cosmetic. */
export function shapeContains(s: Shape, x: number, y: number): boolean {
  if (s.kind === 'ellipse') return ((x - s.cx) / s.rx) ** 2 + ((y - s.cy) / s.ry) ** 2 <= 1
  let on = false
  const pts = s.points
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) on = !on
  }
  return on
}

export function shapeCenter(s: Shape): [number, number] {
  if (s.kind === 'ellipse') return [s.cx, s.cy]
  const n = s.points.length
  return [s.points.reduce((t, p) => t + p[0], 0) / n, s.points.reduce((t, p) => t + p[1], 0) / n]
}

/** The same part on the other side: flip the parity of the code. */
export function mirrorId(id: string): string | null {
  const def = REGION_BY_ID[id]
  if (!def) return null
  const n = Number(id)
  return String(n % 2 === 0 ? n + 1 : n - 1)
}

const family = (id: string) => id[1]
export const LEG_IDS = REGIONS.filter((r) => family(r.id) === '5' || family(r.id) === '6').map((r) => r.id)
export const ARM_IDS = REGIONS.filter((r) => family(r.id) === '3' || family(r.id) === '4').map((r) => r.id)

/** All regions of the same family and side as `id`: the whole arm or leg on both views, the head, or one side of the trunk on that view. */
export function limbOf(id: string): string[] {
  const def = REGION_BY_ID[id]
  if (!def) return [id]
  const fams: Record<string, string[]> = { '0': ['0'], '1': ['1'], '2': ['2'], '3': ['3', '4'], '4': ['3', '4'], '5': ['5', '6'], '6': ['5', '6'] }
  const f = fams[family(id)]
  return REGIONS.filter((r) => f.includes(family(r.id)) && r.side === def.side && (family(id) === '1' || family(id) === '2' ? r.view === def.view : true))
    .map((r) => r.id)
    .sort()
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

export type RegionSummaryItem = { group: Group | 'full' | 'mind'; side: 'both' | Side | 'none' }

/** Collapse region ids into coarse groups with side info, for display. Full body stands for every body region; the mind comes last. */
export function summarizeRegions(regions: string[]): RegionSummaryItem[] {
  const mind: RegionSummaryItem[] = regions.includes(MIND) ? [{ group: 'mind', side: 'none' }] : []
  if (isFullBody(regions)) return [{ group: 'full', side: 'none' }, ...mind]
  const order: Group[] = ['head', 'arm', 'torso', 'back', 'hip', 'leg']
  const sides = new Map<Group, Set<Side>>()
  for (const id of regions) {
    const def = REGION_BY_ID[id]
    if (!def) continue
    if (!sides.has(def.group)) sides.set(def.group, new Set())
    sides.get(def.group)!.add(def.side)
  }
  return [
    ...order
      .filter((g) => sides.has(g))
      .map((g) => {
        const s = sides.get(g)!
        const side: RegionSummaryItem['side'] = s.has('l') && s.has('r') ? 'both' : s.has('l') ? 'l' : 'r'
        return { group: g, side }
      }),
    ...mind,
  ]
}

/**
 * Region ids before version 5 (named, some unsided) and what they became (§5.3). An unsided
 * region became both sides; the hands, shared by both views, became a front and a back hand.
 */
export const LEGACY_REGIONS: Record<string, string[]> = {
  head: ['100', '101', '102', '103'],
  neck: ['104', '105'],
  chest: ['110', '111'],
  abdomen: ['112', '113'],
  pelvis: ['114', '115'],
  'shoulder.l': ['130'], 'shoulder.r': ['131'],
  'upperarm.l': ['132'], 'upperarm.r': ['133'],
  'elbow.l': ['134'], 'elbow.r': ['135'],
  'forearm.l': ['140'], 'forearm.r': ['141'],
  'hand.l': ['144', '244'], 'hand.r': ['145', '245'],
  'hip.l': ['150'], 'hip.r': ['151'],
  'thigh.l': ['152'], 'thigh.r': ['153'],
  'knee.l': ['154'], 'knee.r': ['155'],
  'shin.l': ['160'], 'shin.r': ['161'],
  'ankle.l': ['162'], 'ankle.r': ['163'],
  'foot.l': ['164'], 'foot.r': ['165'],
  'head.back': ['200', '201', '202', '203'],
  'neck.back': ['204', '205'],
  upperback: ['220', '221', '222', '223'],
  lowerback: ['224', '225'],
  'buttock.l': ['226'], 'buttock.r': ['227'],
  'shoulder.back.l': ['230'], 'shoulder.back.r': ['231'],
  'upperarm.back.l': ['232'], 'upperarm.back.r': ['233'],
  'elbow.back.l': ['234'], 'elbow.back.r': ['235'],
  'forearm.back.l': ['240'], 'forearm.back.r': ['241'],
  'thigh.back.l': ['252'], 'thigh.back.r': ['253'],
  'knee.back.l': ['254'], 'knee.back.r': ['255'],
  'calf.l': ['260'], 'calf.r': ['261'],
  'heel.l': ['262'], 'heel.r': ['263'],
  'foot.back.l': ['264'], 'foot.back.r': ['265'],
}

/** Map a pre-v5 region list to today's codes. Codes and unknown ids pass through. */
export function upgradeRegions(regions: string[]): string[] {
  return [...new Set(regions.flatMap((r) => LEGACY_REGIONS[r] ?? [r]))].sort()
}
