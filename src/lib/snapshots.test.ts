/**
 * Snapshots (§4.1, #113): a full copy of the diary kept inside the database, taken before each upgrade, so an upgrade
 * that goes wrong in a way no test foresaw still leaves the diary as it was, a tap away. Export and replace never touch
 * them; the last two of each kind are kept.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Dexie, { type Transaction } from 'dexie'
import { db, resetDb, GomJabbarDB } from './db'
import { addEntry } from './entries'
import { buildExport, parseImport, applyImport, EXPORT_OF_DATABASE } from './backup'
import { takeSnapshot, snapshotUpgrade, listSnapshots, KEEP, type Snapshot } from './snapshots'
import dbV10 from '../test/fixtures/db-v10.json'

const name = () => 'gj-snap-' + Math.random().toString(36).slice(2)
const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))

/** A database as `fixture` left it, under its own name. */
async function stored(fixture: { version: number; stores: Record<string, string>; tables: Record<string, unknown[]> }): Promise<string> {
  const n = name()
  const old = new Dexie(n)
  old.version(fixture.version).stores(fixture.stores)
  for (const [table, rows] of Object.entries(fixture.tables)) await old.table(table).bulkAdd(rows)
  old.close()
  return n
}

beforeEach(() => {
  resetDb()
})

describe('before an upgrade', () => {
  it('the diary as it was is kept, as a backup of the version left', async () => {
    const n = await stored(dbV10)
    const now = resetDb(n)
    await now.open()
    const [snap, ...more] = await listSnapshots()
    expect(more).toEqual([])
    expect(snap.reason).toBe('upgrade')
    expect(snap.file).toMatchObject({ app: 'gom-jabbar', version: EXPORT_OF_DATABASE[10], exportedAt: snap.takenAt })
    expect(byId(snap.file.entries)).toEqual(byId(dbV10.tables.entries as Snapshot['file']['entries']))
    expect(byId(snap.file.presets)).toEqual(byId(dbV10.tables.presets as Snapshot['file']['presets']))
    expect(byId(snap.file.vocabulary.symptoms)).toEqual(byId(dbV10.tables.symptoms as Snapshot['file']['vocabulary']['symptoms']))
    expect(byId(snap.file.vocabulary.tags)).toEqual(byId(dbV10.tables.tags as Snapshot['file']['vocabulary']['tags']))
    expect(parseImport(JSON.stringify(snap.file)).entries).toHaveLength(dbV10.tables.entries.length)
  })

  it('a new database has nothing to keep', async () => {
    await db.open()
    expect(await listSnapshots()).toEqual([])
  })

  it('one per upgrade, however many versions it crosses: the diary as it was before the first', async () => {
    class Ahead extends GomJabbarDB {
      constructor(n: string) {
        super(n)
        const v = this.verno
        this.version(v + 1).stores({}).upgrade((tx) => snapshotUpgrade(tx, v))
        this.version(v + 2).stores({}).upgrade(async (tx) => {
          await snapshotUpgrade(tx, v + 1)
          await tx.table('entries').toCollection().modify((e: { note: string }) => (e.note = 'changed'))
        })
      }
    }
    const n = name()
    const here = resetDb(n)
    await addEntry({ note: 'before' })
    here.close()
    const ahead = new Ahead(n)
    await ahead.open()
    const snaps = await ahead.table('snapshots').toArray()
    expect(snaps).toHaveLength(1)
    expect(snaps[0].file.entries.map((e: { note: string }) => e.note)).toEqual(['before'])
    ahead.close()
  })

  it('an upgrade that fails leaves the diary and the snapshots as they were', async () => {
    const n = name()
    const here = resetDb(n)
    await addEntry({ note: 'safe' })
    for (let i = 0; i < KEEP; i++) await takeSnapshot('upgrade')
    const before = await listSnapshots()
    here.close()
    class Broken extends GomJabbarDB {
      constructor(n: string) {
        super(n)
        const v = this.verno
        this.version(v + 1).stores({}).upgrade(async (tx: Transaction) => {
          await snapshotUpgrade(tx, v)
          await tx.table('entries').toCollection().modify((e: { note: string }) => (e.note = 'half'))
          throw new Error('boom')
        })
      }
    }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(new Broken(n).open()).rejects.toThrow('boom')
    const again = resetDb(n)
    await again.open()
    expect((await again.entries.toArray()).map((e) => e.note)).toEqual(['safe'])
    expect(await listSnapshots()).toEqual(before)
  })
})

describe('kept', () => {
  it('the last two of each kind, newest first', async () => {
    await addEntry({ note: 'x' })
    const taken = []
    for (let i = 0; i < KEEP + 2; i++) taken.push(await takeSnapshot('upgrade'))
    const other = await takeSnapshot('replace')
    const list = await listSnapshots()
    expect(list.map((s) => s.id)).toEqual([other.id, ...taken.slice(-KEEP).reverse().map((s) => s.id)])
  })

  it('out of reach of export and replace', async () => {
    await addEntry({ note: 'x' })
    await takeSnapshot('upgrade')
    const file = await buildExport()
    expect(Object.keys(file)).not.toContain('snapshots')
    expect(JSON.stringify(file)).not.toContain('"reason"')
    await applyImport(parseImport(JSON.stringify({ ...file, entries: [] })), 'replace')
    expect(await listSnapshots()).toHaveLength(1)
  })
})
