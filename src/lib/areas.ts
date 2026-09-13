import { FULL_BODY, isFullBody, mirrorId } from './regions'

/** A set of regions sharing one intensity. An entry has zero or more areas. */
export type Area = { regions: string[]; intensity: number }

export type AreaState = { areas: Area[]; cur: number }

const sortU = (xs: string[]) => [...new Set(xs)].sort()

export function allRegions(areas: Area[]): string[] {
  return sortU(areas.flatMap((a) => a.regions))
}

export function isFull(areas: Area[]): boolean {
  return areas.some((a) => isFullBody(a.regions))
}

export function overallPain(areas: Area[], fallback: number): number {
  return areas.length ? Math.max(...areas.map((a) => a.intensity)) : fallback
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

/** Tap a region: remove it from the current area if it is there, else move it into the current area. */
export function tapRegion(state: AreaState, id: string, mirror: boolean, brush: number): AreaState {
  if (isFull(state.areas)) return state
  const ids = [id]
  const m = mirror ? mirrorId(id) : null
  if (m) ids.push(m)
  let { areas, cur } = state
  if (areas.length === 0) {
    areas = [{ regions: [], intensity: brush }]
    cur = 0
  }
  const inCur = areas[cur].regions.includes(id)
  const stripped = without(areas, ids)
  if (!inCur) stripped[cur] = { ...stripped[cur], regions: sortU([...stripped[cur].regions, ...ids]) }
  return prune({ areas: stripped, cur })
}

/** Toggle a whole set (legs, arms) in the current area. */
export function tapSet(state: AreaState, ids: string[], brush: number): AreaState {
  if (isFull(state.areas)) return state
  let { areas, cur } = state
  if (areas.length === 0) {
    areas = [{ regions: [], intensity: brush }]
    cur = 0
  }
  const all = ids.every((x) => areas[cur].regions.includes(x))
  const stripped = without(areas, ids)
  if (!all) stripped[cur] = { ...stripped[cur], regions: sortU([...stripped[cur].regions, ...ids]) }
  return prune({ areas: stripped, cur })
}

export function toggleFull(state: AreaState, brush: number): AreaState {
  if (isFull(state.areas)) return { areas: [], cur: 0 }
  const intensity = state.areas[state.cur]?.intensity ?? brush
  return { areas: [{ regions: [FULL_BODY], intensity }], cur: 0 }
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
