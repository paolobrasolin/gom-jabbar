import { PAIN, type HistoryPoint, type SymptomCategory } from './types'
import { hasBody, holdsMind, type Layer, type Stroke } from './layers'
import { defaultCategory } from './vocabulary'

/**
 * Rows as written before version 7 (§8): an entry carried its readings and tags once, and `areas`, each a
 * set of regions with one level, the pain there. Presets were the same shape without readings.
 */
export type AreaV6 = { regions: string[]; intensity: number; strokes?: Stroke[] }
export type EntryV6 = { areas: AreaV6[]; readings: Record<string, number>; tags: string[]; history?: { at: string; readings: Record<string, number> }[] }
export type PresetV6 = { areas: AreaV6[]; tags: string[] }

export type CategoryOf = (symptomId: string) => SymptomCategory

/** The category of each symptom id, from the vocabulary at hand; an id it does not know gets the default for its id. */
export function categoryLookup(symptoms: { id: string; category?: SymptomCategory }[]): CategoryOf {
  const known = new Map(symptoms.map((s) => [s.id, s.category]))
  return (id) => known.get(id) ?? defaultCategory(id)
}

/**
 * Where each reading of a whole entry lands among its layers: mind readings on the first layer holding the
 * brain, body readings on the first layer with a body; without such a layer, the first one. Nothing is dropped.
 */
export function placeReadings(readings: Record<string, number>, layers: { regions: string[] }[], categoryOf: CategoryOf): Record<string, number>[] {
  const out: Record<string, number>[] = layers.map(() => ({}))
  const bodyI = Math.max(0, layers.findIndex(hasBody))
  const mindI = Math.max(0, layers.findIndex(holdsMind))
  for (const [id, v] of Object.entries(readings)) out[categoryOf(id) === 'mind' ? mindI : bodyI][id] = v
  return out
}

const layerOf = (a: AreaV6): Layer => ({ regions: a.regions, readings: hasBody(a) ? { [PAIN]: a.intensity } : {}, tags: [], ...(a.strokes ? { strokes: a.strokes } : {}) })

/**
 * The layers of a version 6 entry (§8, 6 → 7): one per area, its level as the pain there (an area holding
 * only the mind had no pain: its level was the highest mental reading, derived, and is not kept). The entry's
 * pain was the max over the body areas and is already there; when no area has a body it is placed like the
 * other readings. Tags go to the first layer. Without areas, one layer without regions takes everything.
 * History points are placed the same way against the same layers.
 */
export function entryToLayers(e: EntryV6, categoryOf: CategoryOf): { layers: Layer[]; history?: HistoryPoint[] } {
  const readings = e.readings ?? {}
  const tags = Array.isArray(e.tags) ? e.tags : []
  let layers: Layer[]
  if (!e.areas?.length) layers = [{ regions: [], readings: { ...readings }, tags: [...tags] }]
  else {
    layers = e.areas.map(layerOf)
    const { [PAIN]: pain, ...rest } = readings
    const placed = placeReadings(layers.some(hasBody) || pain === undefined ? rest : { [PAIN]: pain, ...rest }, layers, categoryOf)
    layers = layers.map((l, i) => ({ ...l, readings: { ...l.readings, ...placed[i] } }))
    layers[0] = { ...layers[0], tags: [...tags] }
  }
  const history = Array.isArray(e.history) ? e.history.map((h) => ({ at: h.at, layers: placeReadings(h.readings ?? {}, layers, categoryOf) })) : undefined
  return { layers, ...(history ? { history } : {}) }
}

/** The layers of a version 6 preset: one per area at its level, the tags on the first; without areas, one empty layer with the tags. */
export function presetToLayers(p: PresetV6): Layer[] {
  const tags = Array.isArray(p.tags) ? p.tags : []
  if (!p.areas?.length) return [{ regions: [], readings: {}, tags: [...tags] }]
  const layers = p.areas.map(layerOf)
  layers[0] = { ...layers[0], tags: [...tags] }
  return layers
}
