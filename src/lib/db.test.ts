/**
 * Older code never writes to a database a newer release has upgraded (§4.1, #113). Dexie opens such a database
 * without complaint, and reopens one closed by a newer copy's upgrade: rows of the old shape would land among the new.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Dexie from 'dexie'
import { db, resetDb, NewerDatabaseError } from './db'
import { outdated } from './outdated.svelte'
import type { Entry } from './types'
import { openNewer as newer } from '../test/newer'

const name = () => 'gj-newer-' + Math.random().toString(36).slice(2)
const row: Entry = { id: 'n1', at: '2026-10-01T10:00:00.000Z', kind: 'chronic', layers: [], note: '', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' }

beforeEach(() => {
  outdated.value = false
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('a database newer than the code', () => {
  it('is not opened: nothing is read or written, and the app knows why', async () => {
    const n = name()
    const ahead = await newer(n)
    await ahead.table('entries').add(row)
    ahead.close()

    resetDb(n)
    await expect(db.open()).rejects.toBeInstanceOf(NewerDatabaseError)
    expect(outdated.value).toBe(true)
    await expect(db.entries.add({ ...row, id: 'old' })).rejects.toThrow()
    await expect(db.entries.count()).rejects.toThrow()

    const after = new Dexie(n)
    await after.open()
    expect(await after.table('entries').toArray()).toEqual([row])
    after.close()
  })

  it('a schema patch is not a newer version: Dexie bumps the native number by one, the database opens', async () => {
    const n = name()
    resetDb(n)
    await db.open()
    const native = db.backendDB().version
    db.close()
    await new Promise<void>((done, fail) => {
      const req = indexedDB.open(n, native + 1)
      req.onsuccess = () => (req.result.close(), done())
      req.onerror = () => fail(req.error)
    })
    resetDb(n)
    await db.open()
    expect(outdated.value).toBe(false)
    await db.entries.add(row)
    expect(await db.entries.count()).toBe(1)
  })
})

describe('a newer copy upgrading the database while this one is open', () => {
  it('closes this one for good: its next write fails instead of reopening, and the app knows why', async () => {
    const n = name()
    resetDb(n)
    await db.open()
    await db.entries.add(row)
    const mine = db
    const ahead = await newer(n)
    expect(outdated.value).toBe(true)
    await expect(mine.entries.add({ ...row, id: 'old' })).rejects.toThrow()
    expect(await ahead.table('entries').toArray()).toEqual([row])
    ahead.close()
  })
})
