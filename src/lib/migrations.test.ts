/**
 * Nothing the user stored is ever lost across a schema or export version.
 *
 * Every version that ever existed has a frozen fixture in `src/test/fixtures`:
 * `db-vN.json` (rows as they sat in IndexedDB under Dexie version N) and
 * `export-vN.json` (a backup file written by export version N). Each is pushed
 * through today's code and must arrive with every field intact, except for the
 * transformations listed in `UPGRADES` below. Bumping a version without adding
 * the fixture of the version you are leaving fails the guard test.
 */
import { describe, it, expect } from 'vitest'
import Dexie from 'dexie'
import { db, resetDb } from './db'
import { parseImport, applyImport, buildExport, EXPORT_VERSION } from './backup'
import { upgradeRegions } from './regions'
import { MIND_DEFAULTS_V6, defaultCategory } from './vocabulary'
import type { SymptomCategory } from './types'
import exportV1 from '../test/fixtures/export-v1.json'
import exportV2 from '../test/fixtures/export-v2.json'
import exportV3 from '../test/fixtures/export-v3.json'
import exportV4 from '../test/fixtures/export-v4.json'
import exportV5 from '../test/fixtures/export-v5.json'
import exportV6 from '../test/fixtures/export-v6.json'
import exportV7 from '../test/fixtures/export-v7.json'
import exportV8 from '../test/fixtures/export-v8.json'
import exportV9 from '../test/fixtures/export-v9.json'
import dbV1 from '../test/fixtures/db-v1.json'
import dbV2 from '../test/fixtures/db-v2.json'
import dbV3 from '../test/fixtures/db-v3.json'
import dbV4 from '../test/fixtures/db-v4.json'
import dbV5 from '../test/fixtures/db-v5.json'
import dbV6 from '../test/fixtures/db-v6.json'
import dbV7 from '../test/fixtures/db-v7.json'
import dbV8 from '../test/fixtures/db-v8.json'
import dbV9 from '../test/fixtures/db-v9.json'

type Row = Record<string, unknown>
type DbFixture = { version: number; stores: Record<string, string>; tables: Record<string, Row[]> }
type ExportFixture = { exportedAt: string; vocabulary: { symptoms: Row[]; tags: Row[] }; entries: Row[]; presets?: Row[] }
type Table = 'entries' | 'presets' | 'symptoms' | 'tags'

const EXPORT_FIXTURES: Record<number, ExportFixture> = { 1: exportV1, 2: exportV2, 3: exportV3, 4: exportV4, 5: exportV5, 6: exportV6, 7: exportV7, 8: exportV8, 9: exportV9 }
const DB_FIXTURES: Record<number, DbFixture> = { 1: dbV1, 2: dbV2, 3: dbV3, 4: dbV4, 5: dbV5, 6: dbV6, 7: dbV7, 8: dbV8, 9: dbV9 }

const regionCodes = (e: Row): Row => (Array.isArray(e.areas) ? { ...e, areas: (e.areas as { regions: string[] }[]).map((a) => ({ ...a, regions: upgradeRegions(a.regions) })) } : e)

/** What a rule may need to know about the rest of the file: the category of a symptom id (§5.2). */
type Ctx = { categoryOf: (id: string) => SymptomCategory }
const ctxOf = (symptoms: Row[]): Ctx => ({ categoryOf: (id) => (symptoms.find((s) => s.id === id)?.category as SymptomCategory | undefined) ?? defaultCategory(id) })

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

/**
 * The documented, deliberate change from version N to N+1, per table.
 * Anything not written here must come through untouched.
 */
const UPGRADES: Record<number, Partial<Record<Table, (r: Row, ctx: Ctx) => Row | Row[]>>> = {
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
}

/** Rows a database upgrade adds, per version and table: the mind defaults that arrived with version 6, when their ids were free. */
const ADDED: Record<number, Partial<Record<Table, (rows: Row[]) => Row[]>>> = {
  6: { symptoms: (rows) => MIND_DEFAULTS_V6.filter((s) => !rows.some((r) => r.id === s.id)) as Row[] },
}

/** What a row of `table` from version `from` must look like today: one row, or the several it became (8). */
function today(e: Row, from: number, to: number, table: Table, ctx: Ctx): Row[] {
  let rows: Row[] = [e]
  for (let v = from; v < to; v++) rows = rows.flatMap((r): Row[] => [(UPGRADES[v][table] ?? ((x: Row) => x))(r, ctx)].flat())
  return rows
}

/** Fields the import normaliser is allowed to fill in when a file left them out. */
function withDefaults(e: Row): Row {
  return { createdAt: e.at, updatedAt: e.at, note: '', ...e }
}

const byId = (rows: Row[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))
const fresh = () => resetDb('gj-mig-' + Math.random().toString(36).slice(2))

describe('every version has a fixture', () => {
  it('export versions', () => {
    for (let v = 1; v <= EXPORT_VERSION; v++) expect(EXPORT_FIXTURES[v], `export-v${v}.json`).toBeDefined()
  })
  it('database versions', async () => {
    const d = fresh()
    await d.open()
    for (let v = 1; v <= d.verno; v++) expect(DB_FIXTURES[v], `db-v${v}.json`).toBeDefined()
  })
})

describe.each(Object.entries(EXPORT_FIXTURES).map(([v, f]) => [Number(v), f] as const))('export file v%i', (version, fixture) => {
  const ctx = ctxOf(fixture.vocabulary.symptoms)
  it('imports with every field intact', () => {
    const parsed = parseImport(JSON.stringify(fixture))
    expect(parsed.version).toBe(EXPORT_VERSION)
    expect(parsed.exportedAt).toBe(fixture.exportedAt)
    expect(parsed.vocabulary).toEqual({
      symptoms: fixture.vocabulary.symptoms.flatMap((s) => today(s, version, EXPORT_VERSION, 'symptoms', ctx)),
      tags: fixture.vocabulary.tags.flatMap((x) => today(x, version, EXPORT_VERSION, 'tags', ctx)),
    })
    expect(parsed.presets).toEqual((fixture.presets ?? []).flatMap((p) => today(p, version, EXPORT_VERSION, 'presets', ctx)))
    const want = fixture.entries.flatMap((e) => today(e, version, EXPORT_VERSION, 'entries', ctx).map(withDefaults))
    expect(parsed.entries.map((e) => e.id)).toEqual(want.map((e) => e.id))
    for (const e of want) expect(parsed.entries.find((x) => x.id === e.id), String(e.id)).toEqual(e)
  })

  it('survives import, storage and export unchanged', async () => {
    fresh()
    const parsed = parseImport(JSON.stringify(fixture))
    await applyImport(parsed, 'replace')
    expect(byId(await db.entries.toArray())).toEqual(byId(parsed.entries))
    const out = await buildExport()
    expect(byId(out.entries)).toEqual(byId(parsed.entries))
    expect(byId(out.vocabulary.symptoms)).toEqual(byId(parsed.vocabulary.symptoms))
    expect(byId(out.vocabulary.tags)).toEqual(byId(parsed.vocabulary.tags))
    expect(byId(out.presets)).toEqual(byId(parsed.presets))
    // Today's export imports as itself.
    const again = parseImport(JSON.stringify(out))
    expect(again).toEqual(out)
  })
})

describe.each(Object.entries(DB_FIXTURES).map(([v, f]) => [Number(v), f] as const))('database v%i', (version, fixture) => {
  it('upgrades with every row and field intact', async () => {
    const name = 'gj-db-' + Math.random().toString(36).slice(2)
    const old = new Dexie(name)
    old.version(fixture.version).stores(fixture.stores)
    for (const [table, rows] of Object.entries(fixture.tables)) await old.table(table).bulkAdd(rows)
    old.close()

    const now = resetDb(name)
    await now.open()
    const ctx = ctxOf(fixture.tables.symptoms ?? [])
    for (const [table, rows] of Object.entries(fixture.tables)) {
      const got = byId(await now.table(table).toArray())
      const added: Row[] = []
      for (let v = version + 1; v <= now.verno; v++) added.push(...(ADDED[v]?.[table as Table]?.([...rows, ...added]) ?? []))
      const want = byId([...rows.flatMap((r) => today(r, version, now.verno, table as Table, ctx)), ...added])
      expect(got, table).toEqual(want)
    }
  })
})

describe('unknown fields', () => {
  it('pass through import, storage and export', async () => {
    fresh()
    const file = { ...exportV2, entries: [{ ...exportV2.entries[0], origin: 'watch', extra: { deep: [1, 2] } }] }
    const parsed = parseImport(JSON.stringify(file))
    expect(parsed.entries[0]).toMatchObject({ origin: 'watch', extra: { deep: [1, 2] } })
    await applyImport(parsed, 'merge')
    const out = await buildExport()
    expect(out.entries[0]).toMatchObject({ origin: 'watch', extra: { deep: [1, 2] } })
  })
})
