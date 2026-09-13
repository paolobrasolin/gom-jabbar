export const FULL_BODY = '*'
export type View = 'front' | 'back'
export type Side = 'l' | 'r'
export type Group = 'head' | 'arm' | 'torso' | 'back' | 'hip' | 'leg'

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }

export type RegionDef = {
  id: string
  view: View
  group: Group
  side?: Side
  shape: Shape
}

export const VIEWBOX = { w: 200, h: 430 }

const rect = (x: number, y: number, w: number, h: number, rx = 8): Shape => ({ kind: 'rect', x, y, w, h, rx })
const ell = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: 'ellipse', cx, cy, rx, ry })

function mirror(s: Shape): Shape {
  return s.kind === 'rect' ? { ...s, x: VIEWBOX.w - s.x - s.w } : { ...s, cx: VIEWBOX.w - s.cx }
}

/** Base shapes drawn on the viewer's left (x < 100). Sided ones get mirrored. */
type Base = { id: string; group: Group; shape: Shape; sided?: boolean }

const FRONT: Base[] = [
  { id: 'head', group: 'head', shape: ell(100, 34, 22, 26) },
  { id: 'neck', group: 'head', shape: rect(88, 60, 24, 14, 4) },
  { id: 'shoulder', group: 'arm', shape: ell(66, 84, 18, 12), sided: true },
  { id: 'chest', group: 'torso', shape: rect(76, 74, 48, 44) },
  { id: 'abdomen', group: 'torso', shape: rect(76, 120, 48, 44) },
  { id: 'upperarm', group: 'arm', shape: rect(44, 94, 22, 56, 10), sided: true },
  { id: 'forearm', group: 'arm', shape: rect(40, 152, 22, 56, 10), sided: true },
  { id: 'hand', group: 'arm', shape: ell(50, 226, 13, 18), sided: true },
  { id: 'hip', group: 'hip', shape: rect(70, 166, 29, 30), sided: true },
  { id: 'thigh', group: 'leg', shape: rect(70, 198, 28, 76, 10), sided: true },
  { id: 'knee', group: 'leg', shape: ell(84, 284, 15, 12), sided: true },
  { id: 'shin', group: 'leg', shape: rect(72, 298, 24, 78, 10), sided: true },
  { id: 'ankle', group: 'leg', shape: ell(84, 386, 12, 9), sided: true },
  { id: 'foot', group: 'leg', shape: rect(68, 397, 30, 22, 8), sided: true },
]

const BACK: Base[] = [
  { id: 'head.back', group: 'head', shape: ell(100, 34, 22, 26) },
  { id: 'neck.back', group: 'head', shape: rect(88, 60, 24, 14, 4) },
  { id: 'shoulder.back', group: 'arm', shape: ell(66, 84, 18, 12), sided: true },
  { id: 'upperback', group: 'back', shape: rect(76, 74, 48, 50) },
  { id: 'lowerback', group: 'back', shape: rect(76, 126, 48, 38) },
  { id: 'upperarm.back', group: 'arm', shape: rect(44, 94, 22, 56, 10), sided: true },
  { id: 'forearm.back', group: 'arm', shape: rect(40, 152, 22, 56, 10), sided: true },
  { id: 'hand', group: 'arm', shape: ell(50, 226, 13, 18), sided: true },
  { id: 'buttock', group: 'hip', shape: rect(70, 166, 29, 30), sided: true },
  { id: 'thigh.back', group: 'leg', shape: rect(70, 198, 28, 76, 10), sided: true },
  { id: 'knee.back', group: 'leg', shape: ell(84, 284, 15, 12), sided: true },
  { id: 'calf', group: 'leg', shape: rect(72, 298, 24, 78, 10), sided: true },
  { id: 'heel', group: 'leg', shape: ell(84, 386, 12, 9), sided: true },
  { id: 'foot.back', group: 'leg', shape: rect(68, 397, 30, 22, 8), sided: true },
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
