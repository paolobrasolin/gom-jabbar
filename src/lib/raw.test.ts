/** When the diary will not open (§4.1, #113): every table as it sits on the phone, read without Dexie, into a file. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Dexie from 'dexie'
import { db, resetDb } from './db'
import { addEntry } from './entries'
import { addPreset } from './presets'
import { buildExport, parseImport, EXPORT_VERSION } from './backup'
import { readRaw, rawFile } from './raw'
import dbV5 from '../test/fixtures/db-v5.json'

const name = () => 'gj-raw-' + Math.random().toString(36).slice(2)
const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
const exists = async (n: string) => (await indexedDB.databases()).some((d) => d.name === n)

beforeEach(() => {
  resetDb()
})

describe('the raw data', () => {
  it('reads every table at the version it is stored in, and the file restores as a backup of that version', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 6 }, tags: ['rest'] }], note: 'x' })
    await addPreset({ name: 'Gambe', layers: [{ regions: ['152'], asks: ['pain'] }], kind: 'chronic' })
    const want = await buildExport()
    db.close()
    const raw = (await readRaw(db.name))!
    expect(raw.version).toBe(db.verno)
    expect(Object.keys(raw.tables).sort()).toEqual(db.tables.map((t) => t.name).sort())
    const file = JSON.parse(rawFile(raw, new Date('2026-10-02T10:00:00Z')))
    expect(file).toMatchObject({ app: 'gom-jabbar', version: EXPORT_VERSION, exportedAt: '2026-10-02T10:00:00.000Z' })
    const back = parseImport(JSON.stringify(file))
    expect(byId(back.entries)).toEqual(byId(want.entries))
    expect(byId(back.presets)).toEqual(byId(want.presets))
    expect(byId(back.vocabulary.symptoms)).toEqual(byId(want.vocabulary.symptoms))
    expect(byId(back.vocabulary.tags)).toEqual(byId(want.vocabulary.tags))
  })

  it('an older database (an upgrade that failed) comes out as a backup of its own version', async () => {
    const n = name()
    const old = new Dexie(n)
    old.version(dbV5.version).stores(dbV5.stores)
    for (const [table, rows] of Object.entries(dbV5.tables)) await old.table(table).bulkAdd(rows)
    old.close()
    const raw = (await readRaw(n))!
    expect(raw.version).toBe(5)
    const file = JSON.parse(rawFile(raw))
    expect(file.version).toBe(5)
    expect(byId(file.entries)).toEqual(byId(dbV5.tables.entries))
    expect(parseImport(JSON.stringify(file)).entries.length).toBeGreaterThanOrEqual(dbV5.tables.entries.length)
  })

  it('a database newer than the code is written out whole but not as a backup: this code cannot say what its rows are', async () => {
    const n = name()
    const ahead = new Dexie(n)
    ahead.version(db.verno + 1).stores({ entries: 'id', extra: 'id' })
    await ahead.table('extra').add({ id: 'x' })
    ahead.close()
    const raw = (await readRaw(n))!
    const file = JSON.parse(rawFile(raw))
    expect(file.app).toBeUndefined()
    expect(file).toMatchObject({ database: db.verno + 1, tables: { entries: [], extra: [{ id: 'x' }] } })
    expect(() => parseImport(JSON.stringify(file))).toThrow('invalid-file')
  })

  it('no database: nothing, and none is created by looking', async () => {
    const n = name()
    expect(await readRaw(n)).toBeNull()
    expect(await exists(n)).toBe(false)
  })

  it('a backup of an old version holds what that version had, and tables no backup holds follow apart', () => {
    const file = JSON.parse(rawFile({ version: 3, tables: { entries: [{ id: 'e' }], symptoms: [], tags: [], extra: [{ id: 'x' }] } }))
    expect(file).not.toHaveProperty('presets')
    expect(file).toMatchObject({ app: 'gom-jabbar', version: 3, entries: [{ id: 'e' }], tables: { extra: [{ id: 'x' }] } })
    expect(JSON.parse(rawFile({ version: 0, tables: {} }))).toMatchObject({ database: 0, tables: {} })
  })

  it('a database with no tables reads as empty', async () => {
    const n = name()
    await new Promise<void>((ok) => {
      const req = indexedDB.open(n, 1)
      req.onsuccess = () => (req.result.close(), ok())
    })
    expect(await readRaw(n)).toEqual({ version: 0, tables: {} })
  })

  describe('when the browser refuses', () => {
    afterEach(() => vi.restoreAllMocks())
    it('says why', async () => {
      vi.spyOn(indexedDB, 'open').mockImplementation(() => {
        const req = { error: new DOMException('refused', 'UnknownError') } as unknown as IDBOpenDBRequest
        setTimeout(() => req.onerror?.(new Event('error')))
        return req
      })
      await expect(readRaw(name())).rejects.toThrow('refused')
    })
  })
})
