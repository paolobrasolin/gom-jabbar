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
import exportV1 from '../test/fixtures/export-v1.json'
import exportV2 from '../test/fixtures/export-v2.json'
import dbV1 from '../test/fixtures/db-v1.json'
import dbV2 from '../test/fixtures/db-v2.json'

type Row = Record<string, unknown>
type DbFixture = { version: number; stores: Record<string, string>; tables: Record<string, Row[]> }
type ExportFixture = { exportedAt: string; vocabulary: unknown; entries: Row[] }

const EXPORT_FIXTURES: Record<number, ExportFixture> = { 1: exportV1, 2: exportV2 }
const DB_FIXTURES: Record<number, DbFixture> = { 1: dbV1, 2: dbV2 }

/**
 * The documented, deliberate change from version N to N+1 for an entry.
 * Anything not written here must come through untouched.
 */
const UPGRADES: Record<number, (e: Row) => Row> = {
  // 1 → 2: `regions` (flat list) became `areas` (region sets with their own level).
  1: ({ regions, ...e }) => ({
    ...e,
    areas: Array.isArray(regions) && regions.length ? [{ regions, intensity: (e.readings as Row | undefined)?.pain ?? 0 }] : [],
  }),
}

/** What an entry from `from` must look like today. */
function today(e: Row, from: number, to: number): Row {
  let r = e
  for (let v = from; v < to; v++) r = UPGRADES[v](r)
  return r
}

/** Fields the import normaliser is allowed to fill in when a file left them out. */
function withDefaults(e: Row): Row {
  return { endedAt: null, ongoing: false, createdAt: e.at, updatedAt: e.at, tags: [], note: '', ...e }
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
  it('imports with every field intact', () => {
    const parsed = parseImport(JSON.stringify(fixture))
    expect(parsed.version).toBe(EXPORT_VERSION)
    expect(parsed.exportedAt).toBe(fixture.exportedAt)
    expect(parsed.vocabulary).toEqual(fixture.vocabulary)
    expect(parsed.entries.map((e) => e.id)).toEqual(fixture.entries.map((e) => e.id))
    for (const e of fixture.entries) {
      const got = parsed.entries.find((x) => x.id === e.id)
      expect(got, String(e.id)).toEqual(withDefaults(today(e, version, EXPORT_VERSION)))
    }
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
    for (const [table, rows] of Object.entries(fixture.tables)) {
      const got = byId(await now.table(table).toArray())
      const want = byId(table === 'entries' ? rows.map((r) => today(r, version, now.verno)) : rows)
      expect(got, table).toEqual(want)
    }
  })
})

describe('unknown fields', () => {
  it('pass through import, storage and export', async () => {
    fresh()
    const file = { ...exportV2, entries: [{ ...exportV2.entries[0], preset: 'schiena', extra: { deep: [1, 2] } }] }
    const parsed = parseImport(JSON.stringify(file))
    expect(parsed.entries[0]).toMatchObject({ preset: 'schiena', extra: { deep: [1, 2] } })
    await applyImport(parsed, 'merge')
    const out = await buildExport()
    expect(out.entries[0]).toMatchObject({ preset: 'schiena', extra: { deep: [1, 2] } })
  })
})
