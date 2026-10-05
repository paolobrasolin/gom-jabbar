/**
 * Nothing stored is lost across versions, for any file or database a past version could have written (#91): generated
 * in each version's shape (`src/test/old-arbitraries.ts`) and checked against the same frozen rules as the fixtures
 * (`src/test/upgrades.ts`, SPEC §8). The fixtures stay: they are what each version actually wrote.
 */
import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import Dexie from 'dexie'
import { resetDb } from './db'
import { parseImport, EXPORT_VERSION, EXPORT_OF_DATABASE } from './backup'
import { ADDED, today, ctxOf, withDefaults, type Row, type Table } from '../test/upgrades'
import { fileOfVersion, type OldFile } from '../test/old-arbitraries'
import { diary } from '../test/arbitraries'
import db1 from '../test/fixtures/db-v1.json'
import db4 from '../test/fixtures/db-v4.json'
import db8 from '../test/fixtures/db-v8.json'
import db11 from '../test/fixtures/db-v11.json'
import { runs } from '../test/runs'

// Each run upgrades a whole database: well past the default 5 s under coverage and a loaded machine.
vi.setConfig({ testTimeout: 60_000 })

const json = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const byId = (rows: Row[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))
const PAST = Array.from({ length: EXPORT_VERSION - 1 }, (_, i) => i + 1)

describe.each(PAST)('a backup of version %i, any one (#91)', (version) => {
  it('imports with every field intact but what the rules convert', () => {
    fc.assert(
      fc.property(fileOfVersion(version), (file) => {
        const ctx = ctxOf(file.vocabulary.symptoms)
        const parsed = parseImport(JSON.stringify(file))
        const want = (rows: Row[], table: Table) => rows.flatMap((r) => today(r, version, EXPORT_VERSION, table, ctx))
        expect(byId(json(parsed.vocabulary.symptoms) as Row[])).toEqual(byId(json(want(file.vocabulary.symptoms, 'symptoms'))))
        expect(byId(json(parsed.vocabulary.tags) as Row[])).toEqual(byId(json(want(file.vocabulary.tags, 'tags'))))
        expect(byId(json(parsed.presets) as Row[])).toEqual(byId(json(want(file.presets ?? [], 'presets'))))
        expect(byId(json(parsed.entries) as Row[])).toEqual(byId(json(want(file.entries, 'entries').map(withDefaults))))
      }),
      { numRuns: runs(60) },
    )
  })
})

/** The schema each database version had, from its frozen fixture; the ones between share it. */
const STORES: Record<number, Record<string, string>> = { 1: db1.stores, 2: db1.stores, 3: db1.stores, 4: db4.stores, 5: db4.stores, 6: db4.stores, 7: db4.stores, 8: db8.stores, 9: db8.stores, 10: db8.stores, 11: db11.stores }
/** Rows as database version `v` stored them: the shape of its export version, today's diary for 10 and 11. */
const rowsOf = (v: number): fc.Arbitrary<OldFile> => (EXPORT_OF_DATABASE[v] < EXPORT_VERSION ? fileOfVersion(EXPORT_OF_DATABASE[v]) : (diary as unknown as fc.Arbitrary<OldFile>))

describe.each(Object.keys(STORES).map(Number))('a database of version %i, any one (#91)', (version) => {
  it('upgrades with every row and field intact but what the rules convert', async () => {
    await fc.assert(
      fc.asyncProperty(rowsOf(version), async (file) => {
        const tables: Record<string, Row[]> = { entries: file.entries, symptoms: file.vocabulary.symptoms, tags: file.vocabulary.tags, ...(STORES[version].presets ? { presets: file.presets ?? [] } : {}) }
        const name = 'gj-prop-' + Math.random().toString(36).slice(2)
        const old = new Dexie(name)
        old.version(version).stores(STORES[version])
        for (const [table, rows] of Object.entries(tables)) await old.table(table).bulkAdd(json(rows))
        old.close()

        const now = resetDb(name)
        await now.open()
        const ctx = ctxOf(tables.symptoms)
        const to = EXPORT_OF_DATABASE[now.verno]
        for (const [table, rows] of Object.entries(tables)) {
          const added: Row[] = []
          for (let v = version + 1; v <= now.verno; v++) added.push(...(ADDED[v]?.[table as Table]?.([...rows, ...added]) ?? []).flatMap((r) => today(r, EXPORT_OF_DATABASE[v], to, table as Table, ctx)))
          const want = byId([...json(rows).flatMap((r) => today(r, EXPORT_OF_DATABASE[version], to, table as Table, ctx)), ...added])
          expect(byId(await now.table(table).toArray()), table).toStrictEqual(json(want))
        }
        now.close()
      }),
      { numRuns: runs(12) },
    )
  })
})
