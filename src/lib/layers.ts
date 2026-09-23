import { FULL_BODY, MIND, isFullBody, mirrorId, type View, type FigureId } from './regions'
import { PAIN, type Symptom, type SymptomCategory } from './types'

/**
 * A piece of paint on one figure (§5.3): a gesture is cut at every segment border, so a stroke lies inside
 * exactly one region, `region`, and goes wherever that region goes. Points are in that figure's viewBox
 * coordinates, `w` is the brush width; one point is a dot.
 */
export type Stroke = { region: string; fig: FigureId; view: View; points: [number, number][]; w: number }

/**
 * One layer of an entry (§5.4): where (regions, optionally shaded by paint), what (readings) and
 * which tags go with it. Layers are independent: a region may sit in several, each with its own readings.
 * A layer without regions is a reading without a location.
 */
export type Layer = {
  regions: string[]
  readings: Record<string, number>
  tags: string[]
  strokes?: Stroke[]
  /** Preset form only (§5.6): the sliders this layer will ask for. Entries never carry it: `finalize` leaves it out. */
  asks?: string[]
}

/** Form state: the layers and which one the map, the sliders and the tag strip edit. */
export type LayerState = { layers: Layer[]; cur: number }

const sortU = (xs: string[]) => [...new Set(xs)].sort()
const uniq = (xs: string[]) => [...new Set(xs)]

export const newLayer = (readings: Record<string, number> = {}): Layer => ({ regions: [], readings: { ...readings }, tags: [] })

export const hasBody = (l: { regions: string[] }): boolean => l.regions.some((r) => r !== MIND)
export const holdsMind = (l: { regions: string[] }): boolean => l.regions.includes(MIND)
export const isFull = (l: { regions: string[] }): boolean => isFullBody(l.regions)

/** Which sliders a layer shows (§6.1): body regions, the body symptoms; the brain, the mind ones; nothing, all of them. */
export function showsCategory(l: { regions: string[] }, category: SymptomCategory): boolean {
  const body = hasBody(l)
  const mind = holdsMind(l)
  if (!body && !mind) return true
  return category === 'body' ? body : mind
}

/** Every region of every layer, once, sorted. */
export function allRegions(layers: { regions: string[] }[]): string[] {
  return sortU(layers.flatMap((l) => l.regions))
}

/** Several records of readings as one: the max per symptom. */
export function maxReadings(records: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of records) for (const [id, v] of Object.entries(r)) if (typeof v === 'number' && (out[id] === undefined || v > out[id])) out[id] = v
  return out
}

/** The entry's readings as one record: the max per symptom over the layers (§5.1). */
export const mergedReadings = (layers: { readings: Record<string, number> }[]): Record<string, number> => maxReadings(layers.map((l) => l.readings))

/** The entry's tags as one list: the union, in order of first appearance. */
export function mergedTags(layers: { tags: string[] }[]): string[] {
  return uniq(layers.flatMap((l) => l.tags))
}

/** Drop layers without regions, except the current one, and clamp `cur`. */
export function prune({ layers, cur }: LayerState): LayerState {
  const kept = layers.filter((l, i) => l.regions.length > 0 || i === cur)
  const next = Math.max(0, Math.min(kept.indexOf(layers[cur]), kept.length - 1))
  return { layers: kept, cur: next }
}

function replace(state: LayerState, layer: Layer): LayerState {
  return { ...state, layers: state.layers.map((l, i) => (i === state.cur ? layer : l)) }
}

/** Take these regions, and the paint inside them, off a layer. */
function strip(l: Layer, ids: string[]): Layer {
  return { ...l, regions: l.regions.filter((r) => !ids.includes(r)), ...(l.strokes ? { strokes: l.strokes.filter((s) => !ids.includes(s.region)) } : {}) }
}

function add(l: Layer, ids: string[]): Layer {
  return { ...l, regions: sortU([...l.regions, ...ids]) }
}

/** Tap a region: it leaves the current layer if it is there, else joins it. Other layers are never touched. The mind is one more region, never mirrored, toggleable under full body. */
export function tapRegion(state: LayerState, id: string, mirror: boolean): LayerState {
  const l = state.layers[state.cur]
  if (!l) return state
  const mind = id === MIND
  if (isFull(l) && !mind) return state
  const ids = [id]
  const m = mirror && !mind ? mirrorId(id) : null
  if (m) ids.push(m)
  return replace(state, l.regions.includes(id) ? strip(l, ids) : add(l, ids))
}

/** Toggle a whole set (legs, arms) in the current layer: all present, they leave; otherwise they all join. */
export function tapSet(state: LayerState, set: string[]): LayerState {
  const l = state.layers[state.cur]
  const ids = set.filter((x) => x !== MIND)
  if (!l || isFull(l) || !ids.length) return state
  const all = ids.every((x) => l.regions.includes(x))
  return replace(state, all ? strip(l, ids) : add(l, ids))
}

/** Full body on the current layer: its regions become the star (and the mind, if selected), its paint stays; off again, the body goes with its paint and the mind stays. */
export function toggleFull(state: LayerState): LayerState {
  const l = state.layers[state.cur]
  if (!l) return state
  const mind = holdsMind(l) ? [MIND] : []
  if (isFull(l)) {
    const { strokes: _, ...rest } = l
    return replace(state, { ...rest, regions: mind })
  }
  return replace(state, { ...l, regions: [FULL_BODY, ...mind] })
}

/** A new empty layer, current. The current one, if it has no regions, already is that layer. */
export function addLayer(state: LayerState, readings: Record<string, number>): LayerState {
  const cur = state.layers[state.cur]
  if (cur && !cur.regions.length) return state
  return prune({ layers: [...state.layers, newLayer(readings)], cur: state.layers.length })
}

export function selectLayer(state: LayerState, i: number): LayerState {
  return prune({ ...state, cur: i })
}

export function setReading(state: LayerState, id: string, v: number): LayerState {
  const l = state.layers[state.cur]
  if (!l) return state
  return replace(state, { ...l, readings: { ...l.readings, [id]: v } })
}

export function toggleTag(state: LayerState, id: string): LayerState {
  const l = state.layers[state.cur]
  if (!l) return state
  return replace(state, { ...l, tags: l.tags.includes(id) ? l.tags.filter((x) => x !== id) : [...l.tags, id] })
}

/** How many pieces of paint the layers hold: a gesture adds some, a tap may take some away. */
export function pieceCount(layers: Layer[]): number {
  return layers.reduce((t, l) => t + (l.strokes?.length ?? 0), 0)
}

/** The layers a save keeps, in order: the located ones, or the first alone when none is. */
export function keptLayers<T extends { regions: string[] }>(layers: T[]): T[] {
  const located = layers.filter((l) => l.regions.length > 0)
  return located.length ? located : layers.slice(0, 1)
}

const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n)))
const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Layers ready to persist: those without regions go, unless none has any, in which case the first stays as
 * the reading without a location. Regions normalized, levels clamped, tags unique, paint rounded. With the
 * vocabulary given, a layer keeps only the readings its regions show (§6.1): no pain on a layer holding just
 * the mind, no mental readings on a body layer.
 */
export function finalize(layers: Layer[], symptoms?: Symptom[]): Layer[] {
  const kept = keptLayers(layers)
  const category = symptoms ? new Map(symptoms.map((s) => [s.id, s.category])) : null
  return kept.map((l) => {
    const readings: Record<string, number> = {}
    for (const [id, v] of Object.entries(l.readings)) {
      const c = category?.get(id)
      if (typeof v !== 'number' || (c && !showsCategory(l, c))) continue
      readings[id] = clamp(v)
    }
    return {
      regions: isFull(l) ? [FULL_BODY, ...(holdsMind(l) ? [MIND] : [])] : sortU(l.regions),
      readings,
      tags: uniq(l.tags),
      ...(l.strokes?.length
        ? { strokes: l.strokes.map((s) => ({ region: s.region, fig: s.fig, view: s.view, points: s.points.map(([x, y]) => [round1(x), round1(y)] as [number, number]), w: round1(s.w) })) }
        : {}),
    }
  })
}

/** Pick, from readings set for a whole entry, those a layer shows: how a preset's sliders reach its layers. */
export function readingsFor(l: { regions: string[] }, readings: Record<string, number>, symptoms: Symptom[]): Record<string, number> {
  const category = new Map(symptoms.map((s) => [s.id, s.category]))
  const out: Record<string, number> = {}
  for (const [id, v] of Object.entries(readings)) {
    const c = category.get(id)
    if (!c || showsCategory(l, c)) out[id] = v
  }
  return out
}

export { PAIN }
