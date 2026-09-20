import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './db'
import { addEntry, updateEntry, deleteEntry, restoreEntry, endEpisode, reopenEpisode, activeEpisodes, durationMs, makeEntry, updateEpisode } from './entries'
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
    const e = await addEntry({ readings: { pain: 6 }, areas: [{ regions: ['153', '152', '152'], intensity: 6 }] })
    expect(e.areas).toEqual([{ regions: ['152', '153'], intensity: 6 }])
    expect(e.ongoing).toBe(false)
    expect(e.endedAt).toBeNull()
    expect(await db.entries.count()).toBe(1)
  })

  it('normalizes areas and derives pain as the max', () => {
    expect(makeEntry({ areas: [{ regions: ['152', '*'], intensity: 3 }] }).areas).toEqual([{ regions: ['*'], intensity: 3 }])
    expect(makeEntry({}).readings).toEqual({ pain: 0 })
    const e = makeEntry({ readings: { pain: 1 }, areas: [{ regions: ['152'], intensity: 8 }, { regions: ['110'], intensity: 3 }, { regions: [], intensity: 10 }] })
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

  it('records reading updates on an episode, starting the history from where it began', async () => {
    const e = await addEntry({ ongoing: true, at: '2026-01-01T10:00:00.000Z', readings: { swelling: 3 }, areas: [{ regions: ['152'], intensity: 7 }] })
    const u = await updateEpisode(e.id, { pain: 4, swelling: 6 }, '2026-01-01T12:00:00.000Z')
    expect(u?.readings).toEqual({ pain: 4, swelling: 6 })
    expect(u?.areas[0].intensity).toBe(4)
    expect(u?.history).toEqual([
      { at: '2026-01-01T10:00:00.000Z', readings: { pain: 7, swelling: 3 } },
      { at: '2026-01-01T12:00:00.000Z', readings: { pain: 4, swelling: 6 } },
    ])
    const w = await updateEpisode(e.id, { pain: 2 }, '2026-01-01T14:00:00.000Z')
    expect(w?.readings).toEqual({ pain: 2, swelling: 6 })
    expect(w?.history).toHaveLength(3)
    const tagged = await updateEpisode(e.id, { pain: 3 }, '2026-01-01T15:00:00.000Z', ['rest'])
    expect(tagged?.tags).toEqual(['rest'])
    const ended = await endEpisode(e.id, '2026-01-01T16:00:00.000Z', ['rest', 'heat'])
    expect(ended?.tags).toEqual(['rest', 'heat'])
    expect(ended?.ongoing).toBe(false)
    const back = await reopenEpisode(e.id)
    expect(back?.ongoing).toBe(true)
    expect(back?.endedAt).toBeNull()
    const two = await addEntry({ ongoing: true, areas: [{ regions: ['152'], intensity: 7 }, { regions: ['110'], intensity: 2 }] })
    const v = await updateEpisode(two.id, { pain: 9 })
    expect(v?.readings.pain).toBe(9)
    expect(v?.areas.map((a) => a.intensity)).toEqual([7, 2])
  })

  it('updates, deletes and restores', async () => {
    const e = await addEntry({ readings: { pain: 3 } })
    const u = await updateEntry(e.id, { note: 'hi', areas: [{ regions: ['*', '110'], intensity: 9 }] })
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

  it('migrates v1 entries with regions to areas', async () => {
    const { default: Dexie } = await import('dexie')
    const name = 'gj-migrate-' + Math.random().toString(36).slice(2)
    const old = new Dexie(name)
    old.version(1).stores({ entries: 'id, at, createdAt, updatedAt', symptoms: 'id, order', tags: 'id, group, order' })
    await old.table('entries').add({ id: 'a', at: '2026-01-01T00:00:00.000Z', endedAt: null, ongoing: false, readings: { pain: 6 }, regions: ['152'], tags: [], note: '', createdAt: 'x', updatedAt: 'x' })
    await old.table('entries').add({ id: 'b', at: '2026-01-02T00:00:00.000Z', endedAt: null, ongoing: false, readings: { pain: 2 }, regions: [], tags: [], note: '', createdAt: 'x', updatedAt: 'x' })
    old.close()
    const fresh = resetDb(name)
    const a = await fresh.entries.get('a')
    const b = await fresh.entries.get('b')
    expect(a?.areas).toEqual([{ regions: ['152'], intensity: 6 }])
    expect((a as unknown as { regions?: unknown }).regions).toBeUndefined()
    expect(b?.areas).toEqual([])
  })

  it('round-trips through a draft', async () => {
    const e = await addEntry({ readings: { pain: 5 }, areas: [{ regions: ['154'], intensity: 5 }], tags: ['rest'], note: ' n ' })
    const d = draftFromEntry(e)
    expect(d.at).toBe(e.at)
    const input = draftToInput(d)
    expect(input.note).toBe('n')
    expect(input.areas).toEqual([{ regions: ['154'], intensity: 5 }])
    const fresh = draftToInput(emptyDraft({ pain: 4 }))
    expect(fresh.readings).toEqual({ pain: 4 })
    expect(Date.parse(fresh.at!)).toBeGreaterThan(Date.now() - 5000)
  })
})
