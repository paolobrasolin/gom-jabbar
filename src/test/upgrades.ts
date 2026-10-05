/**
 * The documented changes from each export version to the next, frozen: what `migrations.test.ts` checks every fixture
 * against, and what the property tests (#91) check generated files and databases of every past version against.
 * Written from SPEC §8, never from the code under test.
 */
import { upgradeRegions } from '../lib/regions'
import { MIND_DEFAULTS_V6 } from '../lib/legacy'
import type { SymptomCategory } from '../lib/types'

export type Row = Record<string, unknown>
export type Table = 'entries' | 'presets' | 'symptoms' | 'tags'

const regionCodes = (e: Row): Row => (Array.isArray(e.areas) ? { ...e, areas: (e.areas as { regions: string[] }[]).map((a) => ({ ...a, regions: upgradeRegions(a.regions) })) } : e)

/** What a rule may need to know about the rest of the file: the category of a symptom id (§5.2). */
export type Ctx = { categoryOf: (id: string) => SymptomCategory }
export const ctxOf = (symptoms: Row[]): Ctx => ({ categoryOf: (id) => (symptoms.find((s) => s.id === id)?.category as SymptomCategory | undefined) ?? (id === 'fog' ? 'mind' : 'body') })

type AreaRow = { regions: string[]; intensity: number; strokes?: unknown }
type Readings = Record<string, number>
const hasBody = (a: { regions: string[] }) => a.regions.some((r) => r !== 'mind')
/** 6 → 7 placement: mind readings on the first area holding the brain, body ones on the first with a body, else the first. */
function place(readings: Readings, areas: { regions: string[] }[], ctx: Ctx): Readings[] {
  const out: Readings[] = areas.map(() => ({}))
  const bodyI = Math.max(0, areas.findIndex(hasBody))
  const mindI = Math.max(0, areas.findIndex((a) => a.regions.includes('mind')))
  for (const [id, v] of Object.entries(readings)) out[ctx.categoryOf(id) === 'mind' ? mindI : bodyI][id] = v
  return out
}
function layersOf(areas: AreaRow[], readings: Readings, tags: string[], ctx: Ctx): Row[] {
  if (!areas.length) return [{ regions: [], readings: { ...readings }, tags: [...tags] }]
  const { pain, ...rest } = readings
  const placed = place(areas.some(hasBody) || pain === undefined ? rest : readings, areas, ctx)
  return areas.map((a, i) => ({
    regions: a.regions,
    readings: { ...(hasBody(a) ? { pain: a.intensity } : {}), ...placed[i] },
    tags: i === 0 ? [...tags] : [],
    ...(a.strokes ? { strokes: a.strokes } : {}),
  }))
}

/** The seed's Italian names up to version 9, per table: a seed row still carrying its own became a dictionary key in 10. */
const SEED_IT_V9: Record<'symptoms' | 'tags', Record<string, string>> = {
  symptoms: { pain: 'Dolore', swelling: 'Gonfiore', heaviness: 'Pesantezza', fatigue: 'Stanchezza', fog: 'Nebbia mentale', tenderness: 'Dolorabilità al tatto', stiffness: 'Rigidità', anxiety: 'Ansia', depression: 'Depressione' },
  tags: {
    compression: 'Compressione', mld: 'Linfodrenaggio', exercise: 'Movimento', rest: 'Riposo', heat: 'Calore', cold: 'Freddo', stretching: 'Stretching', meditation: 'Meditazione',
    period: 'Ciclo', stress: 'Stress', badsleep: 'Dormito male', standing: 'In piedi a lungo', sitting: 'Seduta a lungo', hot_weather: 'Caldo', travel: 'Viaggio',
  },
}
/** 9 → 10: one label. A seed row whose Italian is still the seed's reads from the dictionary; any other keeps its Italian, or its English when the Italian is empty. */
const oneLabel = (table: 'symptoms' | 'tags') => ({ label, ...r }: Row): Row => {
  const l = label as { it: string; en: string }
  const seed = SEED_IT_V9[table][r.id as string]
  return { ...r, label: seed !== undefined && l.it === seed ? `i18n:vocab.${r.id}` : l.it || l.en }
}

/**
 * The documented, deliberate change from version N to N+1, per table.
 * Anything not written here must come through untouched.
 */
export const UPGRADES: Record<number, Partial<Record<Table, (r: Row, ctx: Ctx) => Row | Row[]>>> = {
  // 1 → 2: `regions` (flat list) became `areas` (region sets with their own level).
  1: {
    entries: ({ regions, ...e }) => ({
      ...e,
      areas: Array.isArray(regions) && regions.length ? [{ regions, intensity: (e.readings as Row | undefined)?.pain ?? 0 }] : [],
    }),
  },
  // 2 → 3: history points `{ at, pain }` became `{ at, readings: { pain } }`, so an episode can track every symptom.
  2: { entries: (e) => (Array.isArray(e.history) ? { ...e, history: (e.history as Row[]).map(({ pain, ...h }) => ({ ...h, readings: { pain } })) } : e) },
  // 3 → 4: presets arrive as a new table and export key; entries gain an optional `preset` id. Nothing changes on existing rows.
  3: {},
  // 4 → 5: region ids became CHOIR-based codes; an unsided id became both sides, a hand a front and a back hand. Entries and presets alike.
  4: { entries: regionCodes, presets: regionCodes },
  // 5 → 6: symptoms gain a category: fog is a mind symptom, everything else body (§5.2). The mind region is new data, nothing is converted.
  5: { symptoms: (s) => ({ ...s, category: s.id === 'fog' ? 'mind' : 'body' }) },
  // 6 → 7: `readings`, `areas` and `tags` became `layers` (§5.4, §8): one layer per area, its level as the pain there
  // (an area holding only the mind had no pain: its level was the highest mental reading, derived, not kept); the
  // entry's other readings placed by symptom category, its tags on the first layer; history points placed the same
  // way. Without areas, one layer without regions takes everything. Presets likewise, without readings to place.
  6: {
    entries: ({ readings, areas, tags, history, ...e }, ctx) => {
      const a = (areas as AreaRow[]) ?? []
      const layers = layersOf(a, (readings as Readings) ?? {}, (tags as string[]) ?? [], ctx)
      const points = Array.isArray(history) ? (history as { at: string; readings: Readings }[]).map((h) => ({ at: h.at, layers: place(h.readings, layers as { regions: string[] }[], ctx) })) : undefined
      return { ...e, layers, ...(points ? { history: points } : {}) }
    },
    presets: ({ areas, tags, ...p }, ctx) => ({ ...p, layers: layersOf((areas as AreaRow[]) ?? [], {}, (tags as string[]) ?? [], ctx) }),
  },
  // 7 → 8: an episode is a chain of readings. A row that was ongoing, had ended or carried a history is the head:
  // `kind: 'episode'`, its own id as `episodeId`, `endedAt` as it was (null while active). Each history point is an
  // update, `<id>:<n>`, at the point's time with the head's regions and paint, no tags and no note. When the first
  // point sits at the start the head takes its readings and the point is not repeated; the row's own readings were
  // the latest, so when they differ from the last point's they are one more update at `updatedAt`. Any other row is
  // `kind: 'chronic'`. `preset` becomes `presetId`. `ongoing`, `history` and `preset` go, replaced. Presets: `ongoing` becomes `kind`.
  7: {
    entries: ({ ongoing, history, preset, endedAt, ...e }) => {
      const base = { ...e, ...(preset ? { presetId: preset } : {}) }
      const points = (history as { at: string; layers: Readings[] }[] | undefined) ?? []
      if (!ongoing && !endedAt && !points.length) return { ...base, kind: 'chronic' }
      const layers = e.layers as { readings: Readings }[]
      const readingsOf = (records: Readings[]) => layers.map((l, i) => ({ ...l, readings: { ...(records[i] ?? l.readings) } }))
      const fromStart = points.length > 0 && points[0].at === e.at
      const head = { ...base, kind: 'episode', episodeId: e.id, endedAt: endedAt ?? null, ...(fromStart ? { layers: readingsOf(points[0].layers) } : {}) }
      const later = fromStart ? points.slice(1) : points
      const update = (n: number, at: string, records: Readings[]) => ({
        id: `${e.id}:${n}`, kind: 'episode', episodeId: e.id, at, layers: readingsOf(records).map((l) => ({ ...l, tags: [] })), note: '', createdAt: at, updatedAt: at,
      })
      const out = [head, ...later.map((p, i) => update(i + 1, p.at, p.layers))]
      const last = points[points.length - 1]
      if (fromStart && JSON.stringify(layers.map((l) => l.readings)) !== JSON.stringify(last.layers)) out.push(update(later.length + 1, e.updatedAt as string, layers.map((l) => l.readings)))
      return out
    },
    presets: ({ ongoing, ...p }) => ({ ...p, kind: ongoing ? 'episode' : 'chronic' }),
  },
  // 8 → 9: a preset's `symptomIds` become `asks` on each of its layers: the old list, in its order, kept to what that
  // layer's regions show by symptom category. Without layers, one unlocated layer asks the whole list. `symptomIds`
  // goes once replaced; a layer's `readings` and `tags` stay as they were, unread. Entries are untouched.
  8: {
    presets: ({ symptomIds, layers, ...p }, ctx) => {
      const ids = (symptomIds as string[] | undefined) ?? []
      const shows = (l: { regions: string[] }, id: string) => {
        const body = hasBody(l)
        const mind = l.regions.includes('mind')
        return !body && !mind ? true : ctx.categoryOf(id) === 'mind' ? mind : body
      }
      const ls = (layers as { regions: string[] }[] | undefined) ?? []
      return { ...p, layers: ls.length ? ls.map((l) => ({ ...l, asks: ids.filter((id) => shows(l, id)) })) : [{ regions: [], asks: ids }] }
    },
  },
  // 9 → 10: a symptom's or tag's `label` is one string instead of both languages (§5.2). A seed item whose Italian is
  // still the seed's becomes `i18n:vocab.<id>`, read from the dictionary in the app's language; its English, if renamed,
  // is lost. Any other item keeps its Italian (its English when the Italian is empty): an item renamed differently in
  // the two languages keeps the Italian. Entries and presets are untouched.
  9: { symptoms: oneLabel('symptoms'), tags: oneLabel('tags') },
  // Database 10 → 11 is database-only (export stays 10, EXPORT_OF_DATABASE): the snapshots table arrives, holding the
  // diary as version 10 left it (§4.1, #113; `snapshots.test.ts`). No row of any table changes, so there is no rule here.
}

/** Rows a database upgrade adds, per database version and table: the mind defaults that arrived with version 6, when their ids were free. */
export const ADDED: Record<number, Partial<Record<Table, (rows: Row[]) => Row[]>>> = {
  6: { symptoms: (rows) => MIND_DEFAULTS_V6.filter((s) => !rows.some((r) => r.id === s.id)) as Row[] },
}

/** What a row of `table` from version `from` must look like today: one row, or the several it became (8). */
export function today(e: Row, from: number, to: number, table: Table, ctx: Ctx): Row[] {
  let rows: Row[] = [e]
  for (let v = from; v < to; v++) rows = rows.flatMap((r): Row[] => [(UPGRADES[v][table] ?? ((x: Row) => x))(r, ctx)].flat())
  return rows
}

/** Fields the import normaliser is allowed to fill in when a file left them out. */
export function withDefaults(e: Row): Row {
  return { createdAt: e.at, updatedAt: e.at, note: '', ...e }
}
