import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './db'
import { addEntry, updateEntry, deleteEntry, restoreEntry, endEpisode, activeEpisodes, lastEntry, repeatEntry, durationMs, makeEntry } from './entries'
import { draftFromEntry, draftToInput, emptyDraft } from './draft'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
})

describe('entries', () => {
  it('seeds vocabulary on first open', async () => {
    expect(await db.symptoms.count()).toBeGreaterThan(3)
    expect(await db.tags.count()).toBeGreaterThan(5)
    expect((await db.symptoms.get('pain'))?.label.it).toBe('Dolore')
  })

  it('adds an entry with defaults', async () => {
    const e = await addEntry({ readings: { pain: 6 }, areas: [{ regions: ['thigh.r', 'thigh.l', 'thigh.l'], intensity: 6 }] })
    expect(e.areas).toEqual([{ regions: ['thigh.l', 'thigh.r'], intensity: 6 }])
    expect(e.ongoing).toBe(false)
    expect(e.endedAt).toBeNull()
    expect(await db.entries.count()).toBe(1)
  })

  it('normalizes areas and derives pain as the max', () => {
    expect(makeEntry({ areas: [{ regions: ['thigh.l', '*'], intensity: 3 }] }).areas).toEqual([{ regions: ['*'], intensity: 3 }])
    expect(makeEntry({}).readings).toEqual({ pain: 0 })
    const e = makeEntry({ readings: { pain: 1 }, areas: [{ regions: ['thigh.l'], intensity: 8 }, { regions: ['chest'], intensity: 3 }, { regions: [], intensity: 10 }] })
    expect(e.readings.pain).toBe(8)
    expect(e.areas).toHaveLength(2)
  })

  it('runs an episode lifecycle', async () => {
    const e = await addEntry({ readings: { pain: 7 }, ongoing: true, at: '2026-01-01T10:00:00.000Z' })
    expect((await activeEpisodes()).map((x) => x.id)).toEqual([e.id])
    expect(durationMs(e, Date.parse('2026-01-01T13:00:00.000Z'))).toBe(3 * 3600_000)
    const ended = await endEpisode(e.id, '2026-01-01T12:30:00.000Z')
    expect(ended?.ongoing).toBe(false)
    expect(durationMs(ended!)).toBe(2.5 * 3600_000)
    expect(await activeEpisodes()).toEqual([])
    expect(durationMs(makeEntry({}))).toBeNull()
  })

  it('updates, deletes and restores', async () => {
    const e = await addEntry({ readings: { pain: 3 } })
    const u = await updateEntry(e.id, { note: 'hi', areas: [{ regions: ['*', 'chest'], intensity: 9 }] })
    expect(u?.note).toBe('hi')
    expect(u?.areas).toEqual([{ regions: ['*'], intensity: 9 }])
    expect(u?.readings.pain).toBe(9)
    expect(u!.updatedAt >= e.updatedAt).toBe(true)
    const gone = await deleteEntry(e.id)
    expect(gone?.id).toBe(e.id)
    expect(await db.entries.count()).toBe(0)
    await restoreEntry(gone!)
    expect(await db.entries.count()).toBe(1)
  })

  it('repeats the last entry as a new one now', async () => {
    await addEntry({ readings: { pain: 2 }, at: '2026-01-01T10:00:00.000Z' })
    const b = await addEntry({ readings: { pain: 8, swelling: 4 }, areas: [{ regions: ['*'], intensity: 8 }], tags: ['compression'], note: 'x', at: '2025-01-01T10:00:00.000Z' })
    const last = await lastEntry()
    expect(last?.id).toBe(b.id)
    const r = await repeatEntry(last!)
    expect(r.id).not.toBe(b.id)
    expect(r.readings).toEqual({ pain: 8, swelling: 4 })
    expect(r.areas).toEqual([{ regions: ['*'], intensity: 8 }])
    expect(r.tags).toEqual(['compression'])
    expect(r.note).toBe('')
    expect(Date.parse(r.at)).toBeGreaterThan(Date.now() - 5000)
  })

  it('migrates v1 entries with regions to areas', async () => {
    const { default: Dexie } = await import('dexie')
    const name = 'gj-migrate-' + Math.random().toString(36).slice(2)
    const old = new Dexie(name)
    old.version(1).stores({ entries: 'id, at, createdAt, updatedAt', symptoms: 'id, order', tags: 'id, group, order' })
    await old.table('entries').add({ id: 'a', at: '2026-01-01T00:00:00.000Z', endedAt: null, ongoing: false, readings: { pain: 6 }, regions: ['thigh.l'], tags: [], note: '', createdAt: 'x', updatedAt: 'x' })
    await old.table('entries').add({ id: 'b', at: '2026-01-02T00:00:00.000Z', endedAt: null, ongoing: false, readings: { pain: 2 }, regions: [], tags: [], note: '', createdAt: 'x', updatedAt: 'x' })
    old.close()
    const fresh = resetDb(name)
    const a = await fresh.entries.get('a')
    const b = await fresh.entries.get('b')
    expect(a?.areas).toEqual([{ regions: ['thigh.l'], intensity: 6 }])
    expect((a as unknown as { regions?: unknown }).regions).toBeUndefined()
    expect(b?.areas).toEqual([])
  })

  it('round-trips through a draft', async () => {
    const e = await addEntry({ readings: { pain: 5 }, areas: [{ regions: ['knee.l'], intensity: 5 }], tags: ['rest'], note: ' n ' })
    const d = draftFromEntry(e)
    expect(d.at).toBe(e.at)
    const input = draftToInput(d)
    expect(input.note).toBe('n')
    expect(input.areas).toEqual([{ regions: ['knee.l'], intensity: 5 }])
    const fresh = draftToInput(emptyDraft({ pain: 4 }))
    expect(fresh.readings).toEqual({ pain: 4 })
    expect(Date.parse(fresh.at!)).toBeGreaterThan(Date.now() - 5000)
  })
})
