import { FULL_BODY, MIND, isFullBody, mirrorId, type View, type FigureId } from './regions'

/**
 * A piece of paint on one figure (§5.3): a gesture is cut at every segment border, so a stroke lies inside
 * exactly one region, `region`, and goes wherever that region goes. Points are in that figure's viewBox
 * coordinates, `w` is the brush width; one point is a dot.
 */
export type Stroke = { region: string; fig: FigureId; view: View; points: [number, number][]; w: number }

/**
 * A set of regions sharing one intensity. An entry has zero or more areas. The mind is one region
 * among the others (§5.4); an area holding nothing but the mind has no pain, so its level is the
 * highest mental reading instead. Strokes, when any, shade exact spots inside the body regions (§5.3).
 */
export type Area = { regions: string[]; intensity: number; strokes?: Stroke[] }

export type AreaState = { areas: Area[]; cur: number }

const sortU = (xs: string[]) => [...new Set(xs)].sort()

export function allRegions(areas: Area[]): string[] {
  return sortU(areas.flatMap((a) => a.regions))
}

export function isFull(areas: Area[]): boolean {
  return areas.some((a) => isFullBody(a.regions))
}

/** An area holding the mind and nothing else: no body, so no pain level of its own (§5.4). */
export const isMindOnly = (a: Area): boolean => a.regions.length > 0 && a.regions.every((r) => r === MIND)
export const hasMind = (areas: Area[]): boolean => areas.some((a) => a.regions.includes(MIND))
/** The areas with a body in them (an empty one counts: it is the one being built). */
export const bodyAreas = (areas: Area[]): Area[] => areas.filter((a) => !isMindOnly(a))
/** Only the mind is selected: nothing on the body, so no pain either. */
export const mindOnly = (areas: Area[]): boolean => areas.length > 0 && areas.every(isMindOnly)

/** Pain is the max over the body areas; with only the mind selected it is 0; with no areas at all, the free value. */
export function overallPain(areas: Area[], fallback: number): number {
  const body = bodyAreas(areas)
  if (body.length) return Math.max(...body.map((a) => a.intensity))
  return areas.length ? 0 : fallback
}

/** Drop empty areas (except the current one) and clamp `cur`. */
export function prune({ areas, cur }: AreaState): AreaState {
  const kept = areas.filter((a, i) => a.regions.length > 0 || i === cur)
  const next = Math.max(0, Math.min(kept.indexOf(areas[cur]), kept.length - 1))
  return { areas: kept, cur: next }
}

/** Take these regions, and the paint inside them, off an area. */
function strip(a: Area, ids: string[]): Area {
  return { ...a, regions: a.regions.filter((r) => !ids.includes(r)), ...(a.strokes ? { strokes: a.strokes.filter((s) => !ids.includes(s.region)) } : {}) }
}

function without(areas: Area[], ids: string[]): Area[] {
  return areas.map((a) => strip(a, ids))
}

/** Move these regions into the current area: they leave every other area and their paint comes along. */
export function pullRegions(areas: Area[], cur: number, ids: string[]): Area[] {
  const moved = areas.flatMap((a, i) => (i === cur ? [] : (a.strokes ?? []).filter((s) => ids.includes(s.region))))
  return areas.map((a, i) => {
    if (i !== cur) return strip(a, ids)
    const strokes = [...(a.strokes ?? []), ...moved]
    return { ...a, regions: sortU([...a.regions, ...ids]), ...(strokes.length ? { strokes } : {}) }
  })
}

/** The current area, or a new one at the brush level when there is none. */
function target({ areas, cur }: AreaState, brush: number): AreaState {
  if (areas[cur]) return { areas, cur }
  return { areas: [...areas, { regions: [], intensity: brush }], cur: areas.length }
}

/** A body tap (or stroke) goes to the current area; one holding only the mind takes the brush level as the body joins it (§5.4). */
export function bodyTarget(state: AreaState, brush: number): AreaState {
  const { areas, cur } = target(state, brush)
  if (!isMindOnly(areas[cur])) return { areas, cur }
  return { areas: areas.map((a, i) => (i === cur ? { ...a, intensity: brush } : a)), cur }
}

/** Tap a region: remove it from the current area if it is there, else move it into the current area. The mind is one more region, never mirrored, toggleable under full body. */
export function tapRegion(state: AreaState, id: string, mirror: boolean, brush: number): AreaState {
  const mind = id === MIND
  if (isFull(state.areas) && !mind) return state
  const ids = [id]
  const m = mirror && !mind ? mirrorId(id) : null
  if (m) ids.push(m)
  const { areas, cur } = mind ? target(state, brush) : bodyTarget(state, brush)
  const inCur = areas[cur].regions.includes(id)
  return prune({ areas: inCur ? without(areas, ids) : pullRegions(areas, cur, ids), cur })
}

/** Toggle a whole set (legs, arms) in the current area. */
export function tapSet(state: AreaState, set: string[], brush: number): AreaState {
  const ids = set.filter((x) => x !== MIND)
  if (isFull(state.areas) || !ids.length) return state
  const { areas, cur } = bodyTarget(state, brush)
  const all = ids.every((x) => areas[cur].regions.includes(x))
  return prune({ areas: all ? without(areas, ids) : pullRegions(areas, cur, ids), cur })
}

/** An area holding only the mind has no pain, so it takes the level given (the highest mental reading); the others keep theirs. */
export function setMindLevel(areas: Area[], level: number): Area[] {
  return areas.map((a) => (isMindOnly(a) ? { ...a, intensity: level } : a))
}

/** Full body replaces every area with one, keeping their paint and the mind; off again, the mind, if selected, stays on its own. */
export function toggleFull(state: AreaState, brush: number): AreaState {
  const mind = hasMind(state.areas) ? [MIND] : []
  const cur = state.areas[state.cur]
  if (isFull(state.areas)) return { areas: mind.length ? [{ regions: mind, intensity: cur?.intensity ?? brush }] : [], cur: 0 }
  const intensity = cur && !isMindOnly(cur) ? cur.intensity : brush
  const strokes = state.areas.flatMap((a) => a.strokes ?? [])
  return { areas: [{ regions: [FULL_BODY, ...mind], intensity, ...(strokes.length ? { strokes } : {}) }], cur: 0 }
}

export function addArea(state: AreaState, brush: number): AreaState {
  const { areas } = prune(state)
  const nonEmpty = areas.filter((a) => a.regions.length > 0)
  return { areas: [...nonEmpty, { regions: [], intensity: brush }], cur: nonEmpty.length }
}

export function selectArea(state: AreaState, i: number): AreaState {
  return prune({ ...state, cur: i })
}

export function setIntensity(state: AreaState, v: number): AreaState {
  if (!state.areas[state.cur]) return state
  const areas = state.areas.map((a, i) => (i === state.cur ? { ...a, intensity: v } : a))
  return { ...state, areas }
}

/** Areas ready to persist: no empties, regions normalized. */
export function finalize(areas: Area[]): Area[] {
  return areas
    .filter((a) => a.regions.length > 0)
    .map((a) => ({
      regions: isFullBody(a.regions) ? [FULL_BODY, ...(a.regions.includes(MIND) ? [MIND] : [])] : sortU(a.regions),
      intensity: clamp(a.intensity),
      ...(a.strokes?.length
        ? { strokes: a.strokes.map((s) => ({ region: s.region, fig: s.fig, view: s.view, points: s.points.map(([x, y]) => [round1(x), round1(y)] as [number, number]), w: round1(s.w) })) }
        : {}),
    }))
}

const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n)))
const round1 = (n: number) => Math.round(n * 10) / 10
