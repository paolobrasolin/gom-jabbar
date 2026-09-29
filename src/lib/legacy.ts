import { PAIN, type Entry, type Label, type SymptomCategory } from './types'
import { hasBody, holdsMind, showsCategory, type Layer, type Stroke } from './layers'
import { defaultCategory, I18N } from './vocabulary'

/** A symptom's or tag's name as written before version 10 (§5.2): both languages. */
export type LabelV9 = { it: string; en: string }

/** The seed as it was written before version 10, per table: labels in both languages. Frozen: the upgrades read it. */
export const SEED_V9: Record<'symptoms' | 'tags', Record<string, LabelV9>> = {
  symptoms: {
    pain: { it: 'Dolore', en: 'Pain' },
    swelling: { it: 'Gonfiore', en: 'Swelling' },
    heaviness: { it: 'Pesantezza', en: 'Heaviness' },
    fatigue: { it: 'Stanchezza', en: 'Fatigue' },
    fog: { it: 'Nebbia mentale', en: 'Brain fog' },
    tenderness: { it: 'Dolorabilità al tatto', en: 'Tenderness' },
    stiffness: { it: 'Rigidità', en: 'Stiffness' },
    anxiety: { it: 'Ansia', en: 'Anxiety' },
    depression: { it: 'Depressione', en: 'Depression' },
  },
  tags: {
    compression: { it: 'Compressione', en: 'Compression' },
    mld: { it: 'Linfodrenaggio', en: 'Lymphatic drainage' },
    exercise: { it: 'Movimento', en: 'Exercise' },
    rest: { it: 'Riposo', en: 'Rest' },
    heat: { it: 'Calore', en: 'Heat' },
    cold: { it: 'Freddo', en: 'Cold' },
    stretching: { it: 'Stretching', en: 'Stretching' },
    meditation: { it: 'Meditazione', en: 'Meditation' },
    period: { it: 'Ciclo', en: 'Period' },
    stress: { it: 'Stress', en: 'Stress' },
    badsleep: { it: 'Dormito male', en: 'Slept badly' },
    standing: { it: 'In piedi a lungo', en: 'Standing long' },
    sitting: { it: 'Seduta a lungo', en: 'Sitting long' },
    hot_weather: { it: 'Caldo', en: 'Hot weather' },
    travel: { it: 'Viaggio', en: 'Travel' },
  },
}

/** Mind symptoms that arrived with version 6, as written then: a database upgraded from before gets them too, when their ids are free. */
export const MIND_DEFAULTS_V6 = [
  { id: 'anxiety', label: SEED_V9.symptoms.anxiety, category: 'mind', enabled: true, order: 7 },
  { id: 'depression', label: SEED_V9.symptoms.depression, category: 'mind', enabled: true, order: 8 },
]

/**
 * A label as written before version 10 as one string (§5.2, §8): a seed item whose Italian is still the seed's reads
 * from the dictionary (a rename of its English alone is lost); any other keeps its Italian, or its English when the
 * Italian is empty (a rename that differed in the two languages keeps the Italian). A label already a string is kept.
 */
export function oneLabel(table: 'symptoms' | 'tags', id: string, label: unknown): Label {
  if (typeof label === 'string') return label
  const l = (label ?? {}) as Partial<LabelV9>
  const seed = SEED_V9[table][id]
  if (seed && l.it === seed.it) return `${I18N}vocab.${id}`
  return l.it || l.en || ''
}

/**
 * Rows as written before version 7 (§8): an entry carried its readings and tags once, and `areas`, each a
 * set of regions with one level, the pain there. Presets were the same shape without readings.
 */
export type AreaV6 = { regions: string[]; intensity: number; strokes?: Stroke[] }
export type EntryV6 = { areas: AreaV6[]; readings: Record<string, number>; tags: string[]; history?: { at: string; readings: Record<string, number> }[] }
export type PresetV6 = { areas: AreaV6[]; tags: string[] }

/** Readings at one moment of an episode as written before version 8: one record per layer, aligned with the entry's layers. */
export type HistoryPoint = { at: string; layers: Record<string, number>[] }

/**
 * An entry as written before version 8 (§5.5, §8): an episode was one row whose `layers` held the latest readings and
 * whose `history` held the trail, the starting readings first (since version 3; before, the first update).
 */
export type EntryV7 = {
  id: string
  at: string
  endedAt?: string | null
  ongoing?: boolean
  layers: Layer[]
  history?: HistoryPoint[]
  preset?: string
  note: string
  createdAt: string
  updatedAt: string
  [k: string]: unknown
}

/** A preset as written before version 8: `ongoing` said whether a save opened an episode. */
export type PresetV7 = { ongoing?: boolean; [k: string]: unknown }

/** A preset as written before version 9: one list of sliders, `symptomIds`, for every layer. */
export type PresetV8 = { symptomIds?: string[]; layers?: { regions?: string[]; [k: string]: unknown }[]; [k: string]: unknown }

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

/** Each layer with the readings of `records` at its index; a layer without a record keeps its own. */
const withReadings = (layers: Layer[], records: Record<string, number>[]): Layer[] => layers.map((l, i) => ({ ...l, readings: { ...(records[i] ?? l.readings) } }))
const sameReadings = (layers: Layer[], records: Record<string, number>[]): boolean =>
  layers.length === records.length && layers.every((l, i) => JSON.stringify(l.readings) === JSON.stringify(records[i]))

/**
 * Version 7 → 8 (§8): an episode becomes a chain. The row is the head, `kind: 'episode'`, its own id as `episodeId`,
 * `endedAt` as it was (null while active); it is an episode when it was ongoing, had ended, or carried a history at
 * all. Every history point becomes an update: a reading at that time, the head's regions and paint, no tags, id
 * `<head id>:<n>`. When the first point sits at the start (histories since version 3) the head takes its readings
 * and the point is not repeated; the row's own readings were the latest, so if they differ from the last point's
 * they are one more reading at `updatedAt`. Any other row is a chronic snapshot. `preset` becomes `presetId`;
 * `ongoing`, `history` and `preset` are dropped only after their replacements are written.
 */
export function splitEpisode(row: EntryV7): Entry[] {
  const { ongoing, history, preset, endedAt, ...rest } = row
  const base = { ...rest, ...(preset ? { presetId: preset } : {}) } as Omit<Entry, 'kind'>
  const points = Array.isArray(history) ? history : []
  if (!ongoing && !endedAt && !points.length) return [{ ...base, kind: 'chronic' }]
  const head: Entry = { ...base, kind: 'episode', episodeId: row.id, endedAt: endedAt ?? null }
  const startsAtHead = points.length > 0 && points[0].at === row.at
  if (startsAtHead) head.layers = withReadings(row.layers, points[0].layers)
  const later = startsAtHead ? points.slice(1) : points
  const updates: Entry[] = later.map((p, i) => ({
    id: `${row.id}:${i + 1}`,
    kind: 'episode',
    episodeId: row.id,
    at: p.at,
    layers: withReadings(row.layers, p.layers).map((l) => ({ ...l, tags: [] })),
    note: '',
    createdAt: p.at,
    updatedAt: p.at,
  }))
  if (startsAtHead && !sameReadings(row.layers, points[points.length - 1].layers)) {
    updates.push({
      id: `${row.id}:${later.length + 1}`,
      kind: 'episode',
      episodeId: row.id,
      at: row.updatedAt,
      layers: row.layers.map((l) => ({ ...l, readings: { ...l.readings }, tags: [] })),
      note: '',
      createdAt: row.updatedAt,
      updatedAt: row.updatedAt,
    })
  }
  return [head, ...updates]
}

/**
 * Version 8 → 9 for a preset (§5.6): `symptomIds` becomes `asks` on each layer, the old list in its order kept to
 * what that layer's regions show by symptom category, which is what the old sheet ended up recording there. A
 * preset without layers gets one unlocated layer asking the whole list. `symptomIds` goes once replaced; a layer's
 * `readings` and `tags` stay as they were, unread.
 */
export function presetAsks(p: PresetV8, categoryOf: CategoryOf): Record<string, unknown> {
  const { symptomIds, layers, ...rest } = p
  const ids = Array.isArray(symptomIds) ? symptomIds : []
  const ls = Array.isArray(layers) ? layers : []
  const withRegions = (l: { regions?: unknown; [k: string]: unknown }) => ({ ...l, regions: Array.isArray(l.regions) ? (l.regions as string[]) : [] })
  return { ...rest, layers: ls.length ? ls.map(withRegions).map((l) => ({ ...l, asks: ids.filter((id) => showsCategory(l, categoryOf(id))) })) : [{ regions: [], asks: [...ids] }] }
}

/** Version 7 → 8 for a preset: `ongoing` becomes `kind`. */
export function presetKind(p: PresetV7): Record<string, unknown> {
  const { ongoing, ...rest } = p
  return { ...rest, kind: ongoing ? 'episode' : 'chronic' }
}
