import { FULL_BODY, MIND, isFullBody, mirrorId } from './regions'

/**
 * A set of regions sharing one intensity. An entry has zero or more areas. The mind is always
 * alone in its area, whose level is the highest mental reading (§5.4); every other area is a body area.
 */
export type Area = { regions: string[]; intensity: number }

export type AreaState = { areas: Area[]; cur: number }

const sortU = (xs: string[]) => [...new Set(xs)].sort()

export function allRegions(areas: Area[]): string[] {
  return sortU(areas.flatMap((a) => a.regions))
}

export function isFull(areas: Area[]): boolean {
  return areas.some((a) => isFullBody(a.regions))
}

export const isMindArea = (a: Area): boolean => a.regions.includes(MIND)
export const hasMind = (areas: Area[]): boolean => areas.some(isMindArea)
export const bodyAreas = (areas: Area[]): Area[] => areas.filter((a) => !isMindArea(a))
/** Only the mind is selected: nothing on the body, so no pain either. */
export const mindOnly = (areas: Area[]): boolean => areas.length > 0 && areas.every(isMindArea)

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

function without(areas: Area[], ids: string[]): Area[] {
  return areas.map((a) => ({ ...a, regions: a.regions.filter((r) => !ids.includes(r)) }))
}

/** A body tap goes to the current area when it is a body area, else to the last body area, else to a new one at the brush level. */
function bodyTarget({ areas, cur }: AreaState, brush: number): AreaState {
  if (areas[cur] && !isMindArea(areas[cur])) return { areas, cur }
  let i = areas.length - 1
  while (i >= 0 && isMindArea(areas[i])) i--
  if (i >= 0) return { areas, cur: i }
  return { areas: [...areas, { regions: [], intensity: brush }], cur: areas.length }
}

/** Tap a region: remove it from the current area if it is there, else move it into the current area. The mind toggles its own area. */
export function tapRegion(state: AreaState, id: string, mirror: boolean, brush: number): AreaState {
  if (id === MIND) return toggleMind(state, brush)
  if (isFull(state.areas)) return state
  const ids = [id]
  const m = mirror ? mirrorId(id) : null
  if (m) ids.push(m)
  const { areas, cur } = bodyTarget(state, brush)
  const inCur = areas[cur].regions.includes(id)
  const stripped = without(areas, ids)
  if (!inCur) stripped[cur] = { ...stripped[cur], regions: sortU([...stripped[cur].regions, ...ids]) }
  return prune({ areas: stripped, cur })
}

/** Toggle a whole set (legs, arms) in the current area. */
export function tapSet(state: AreaState, set: string[], brush: number): AreaState {
  const ids = set.filter((x) => x !== MIND)
  if (isFull(state.areas) || !ids.length) return state
  const { areas, cur } = bodyTarget(state, brush)
  const all = ids.every((x) => areas[cur].regions.includes(x))
  const stripped = without(areas, ids)
  if (!all) stripped[cur] = { ...stripped[cur], regions: sortU([...stripped[cur].regions, ...ids]) }
  return prune({ areas: stripped, cur })
}

/** Toggle the mind: off removes its area, on appends one at `level` (the highest mental reading) and makes it current. */
export function toggleMind(state: AreaState, level: number): AreaState {
  const i = state.areas.findIndex(isMindArea)
  if (i >= 0) {
    const areas = state.areas.filter((_, j) => j !== i)
    const cur = state.cur === i ? 0 : state.cur > i ? state.cur - 1 : state.cur
    return prune({ areas, cur })
  }
  return prune({ areas: [...state.areas, { regions: [MIND], intensity: level }], cur: state.areas.length })
}

/** The mind area, if any, takes the level given (the highest mental reading). */
export function setMindLevel(areas: Area[], level: number): Area[] {
  return areas.map((a) => (isMindArea(a) ? { ...a, intensity: level } : a))
}

/** Full body replaces every body area with one; the mind area, if any, stays. */
export function toggleFull(state: AreaState, brush: number): AreaState {
  const mind = state.areas.filter(isMindArea)
  if (isFull(state.areas)) return { areas: mind, cur: 0 }
  const cur = state.areas[state.cur]
  const intensity = cur && !isMindArea(cur) ? cur.intensity : brush
  return { areas: [{ regions: [FULL_BODY], intensity }, ...mind], cur: 0 }
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
    .map((a) => ({ regions: isFullBody(a.regions) ? [FULL_BODY] : sortU(a.regions), intensity: clamp(a.intensity) }))
}

const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n)))
