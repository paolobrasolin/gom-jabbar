/**
 * Nothing the user stored is ever lost across a schema or export version.
 *
 * Every version that ever existed has a frozen fixture in `src/test/fixtures`:
 * `db-vN.json` (rows as they sat in IndexedDB under Dexie version N) and
 * `export-vN.json` (a backup file written by export version N), each with a row
 * carrying fields no version knows and a row of a dirty shape (no note, no
 * timestamps). Each is pushed through today's code and must arrive with every
 * field intact, except for the transformations listed in `UPGRADES` (`src/test/upgrades.ts`).
 *
 * A version change needs two fixtures: the version you leave, frozen before
 * touching anything, and the version you arrive at, added once it works. The
 * guard test wants one for every version up to today's, and the arrival is what
 * the next change is checked against. `UPGRADES` is keyed by export version;
 * a database version that changes only the database (a table, an index) maps to
 * the export version before it in `EXPORT_OF_DATABASE` and needs no rule.
 */
import { describe, it, expect } from 'vitest'
import Dexie from 'dexie'
import { db, resetDb } from './db'
import { parseImport, applyImport, buildExport, EXPORT_VERSION, EXPORT_OF_DATABASE } from './backup'
import { ADDED, today, ctxOf, withDefaults, type Row, type Table } from '../test/upgrades'
import exportV1 from '../test/fixtures/export-v1.json'
import exportV2 from '../test/fixtures/export-v2.json'
import exportV3 from '../test/fixtures/export-v3.json'
import exportV4 from '../test/fixtures/export-v4.json'
import exportV5 from '../test/fixtures/export-v5.json'
import exportV6 from '../test/fixtures/export-v6.json'
import exportV7 from '../test/fixtures/export-v7.json'
import exportV8 from '../test/fixtures/export-v8.json'
import exportV9 from '../test/fixtures/export-v9.json'
import exportV10 from '../test/fixtures/export-v10.json'
import dbV1 from '../test/fixtures/db-v1.json'
import dbV2 from '../test/fixtures/db-v2.json'
import dbV3 from '../test/fixtures/db-v3.json'
import dbV4 from '../test/fixtures/db-v4.json'
import dbV5 from '../test/fixtures/db-v5.json'
import dbV6 from '../test/fixtures/db-v6.json'
import dbV7 from '../test/fixtures/db-v7.json'
import dbV8 from '../test/fixtures/db-v8.json'
import dbV9 from '../test/fixtures/db-v9.json'
import dbV10 from '../test/fixtures/db-v10.json'
import dbV11 from '../test/fixtures/db-v11.json'

type DbFixture = { version: number; stores: Record<string, string>; tables: Record<string, Row[]> }
type ExportFixture = { exportedAt: string; vocabulary: { symptoms: Row[]; tags: Row[] }; entries: Row[]; presets?: Row[] }

const EXPORT_FIXTURES: Record<number, ExportFixture> = { 1: exportV1, 2: exportV2, 3: exportV3, 4: exportV4, 5: exportV5, 6: exportV6, 7: exportV7, 8: exportV8, 9: exportV9, 10: exportV10 }
const DB_FIXTURES: Record<number, DbFixture> = { 1: dbV1, 2: dbV2, 3: dbV3, 4: dbV4, 5: dbV5, 6: dbV6, 7: dbV7, 8: dbV8, 9: dbV9, 10: dbV10, 11: dbV11 }

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
  it("each database version names the export version of its rows, never going back, today's last", async () => {
    const d = fresh()
    await d.open()
    for (let v = 1; v <= d.verno; v++) {
      expect(EXPORT_OF_DATABASE[v], `database ${v}`).toBeDefined()
      if (v > 1) expect(EXPORT_OF_DATABASE[v]).toBeGreaterThanOrEqual(EXPORT_OF_DATABASE[v - 1])
    }
    expect(EXPORT_OF_DATABASE[d.verno]).toBe(EXPORT_VERSION)
    expect(Object.keys(EXPORT_OF_DATABASE)).toHaveLength(d.verno)
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
      // Rows an upgrade added go through the upgrades after it, like every other row.
      // Rules are per export version: a database version converts as the export version of its rows.
      const to = EXPORT_OF_DATABASE[now.verno]
      for (let v = version + 1; v <= now.verno; v++) added.push(...(ADDED[v]?.[table as Table]?.([...rows, ...added]) ?? []).flatMap((r) => today(r, EXPORT_OF_DATABASE[v], to, table as Table, ctx)))
      const want = byId([...rows.flatMap((r) => today(r, EXPORT_OF_DATABASE[version], to, table as Table, ctx)), ...added])
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
