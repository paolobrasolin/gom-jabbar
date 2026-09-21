import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './db'
import { addEntry, updateEntry, deleteEntry, restoreEntry, endEpisode, reopenEpisode, activeEpisodes, durationMs, makeEntry, updateEpisode } from './entries'
import { draftFromEntry, draftToInput, emptyDraft } from './draft'
import { DEFAULT_SYMPTOMS } from './vocabulary'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
})

const L = (regions: string[], readings: Record<string, number>, tags: string[] = []) => ({ regions, readings, tags })

describe('entries', () => {
  it('seeds vocabulary on first open', async () => {
    expect(await db.symptoms.count()).toBeGreaterThan(3)
    expect(await db.tags.count()).toBeGreaterThan(5)
    expect((await db.symptoms.get('pain'))?.label.it).toBe('Dolore')
  })

  it('adds an entry with defaults, its layers finalized against the vocabulary', async () => {
    const e = await addEntry({ layers: [{ regions: ['153', '152', '152'], readings: { pain: 6, fog: 3 } }] })
    expect(e.layers).toEqual([L(['152', '153'], { pain: 6 })])
    expect(e.ongoing).toBe(false)
    expect(e.endedAt).toBeNull()
    expect(await db.entries.count()).toBe(1)
  })

  it('makeEntry: readings and tags alone are one layer without a location; layers are normalized', () => {
    expect(makeEntry({}).layers).toEqual([L([], {})])
    expect(makeEntry({ readings: { pain: 4 }, tags: ['rest'] }).layers).toEqual([L([], { pain: 4 }, ['rest'])])
    expect(makeEntry({ layers: [{ regions: ['152', '*'], readings: { pain: 3 } }] }).layers).toEqual([L(['*'], { pain: 3 })])
    const e = makeEntry({ layers: [{ regions: ['152'], readings: { pain: 8 } }, { regions: ['110'], readings: { pain: 3 } }, { regions: [], readings: { pain: 10 } }] })
    expect(e.layers).toHaveLength(2)
    expect(makeEntry({ layers: [] }).layers).toEqual([L([], {})])
    // With the vocabulary, a layer keeps only what its regions show.
    expect(makeEntry({ layers: [{ regions: ['mind'], readings: { pain: 5, fog: 2 } }] }, DEFAULT_SYMPTOMS).layers).toEqual([L(['mind'], { fog: 2 })])
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
    expect(await endEpisode('nope')).toBeUndefined()
  })

  it('records reading updates per layer on an episode, starting the history from where it began', async () => {
    const e = await addEntry({ ongoing: true, at: '2026-01-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 7, swelling: 3 } }, { regions: ['mind'], readings: { fog: 5 } }] })
    const u = await updateEpisode(e.id, [{ pain: 4, swelling: 6 }], '2026-01-01T12:00:00.000Z')
    expect(u?.layers).toEqual([L(['152'], { pain: 4, swelling: 6 }), L(['mind'], { fog: 5 })])
    expect(u?.history).toEqual([
      { at: '2026-01-01T10:00:00.000Z', layers: [{ pain: 7, swelling: 3 }, { fog: 5 }] },
      { at: '2026-01-01T12:00:00.000Z', layers: [{ pain: 4, swelling: 6 }, { fog: 5 }] },
    ])
    const w = await updateEpisode(e.id, [undefined, { fog: 2 }], '2026-01-01T14:00:00.000Z')
    expect(w?.layers.map((l) => l.readings)).toEqual([{ pain: 4, swelling: 6 }, { fog: 2 }])
    expect(w?.history).toHaveLength(3)
    // Tags per layer travel with an update or an end; an omitted list leaves that layer's tags alone.
    const tagged = await updateEpisode(e.id, [{ pain: 3 }], '2026-01-01T15:00:00.000Z', [['rest'], undefined])
    expect(tagged?.layers.map((l) => l.tags)).toEqual([['rest'], []])
    const ended = await endEpisode(e.id, '2026-01-01T16:00:00.000Z', [['rest', 'heat'], ['stress']])
    expect(ended?.layers.map((l) => l.tags)).toEqual([['rest', 'heat'], ['stress']])
    expect(ended?.ongoing).toBe(false)
    const back = await reopenEpisode(e.id)
    expect(back?.ongoing).toBe(true)
    expect(back?.endedAt).toBeNull()
    expect(await updateEpisode('nope', [])).toBeUndefined()
  })

  it('updates, deletes and restores', async () => {
    const e = await addEntry({ readings: { pain: 3 } })
    const u = await updateEntry(e.id, { note: 'hi', layers: [{ regions: ['*', '110'], readings: { pain: 9, fog: 1 }, tags: [] }] })
    expect(u?.note).toBe('hi')
    expect(u?.layers).toEqual([L(['*'], { pain: 9 })])
    expect(u!.updatedAt >= e.updatedAt).toBe(true)
    const gone = await deleteEntry(e.id)
    expect(gone?.id).toBe(e.id)
    expect(await db.entries.count()).toBe(0)
    await restoreEntry(gone!)
    expect(await db.entries.count()).toBe(1)
  })

  it('upgrades a version 1 database with regions all the way to layers', async () => {
    const { default: Dexie } = await import('dexie')
    const name = 'gj-migrate-' + Math.random().toString(36).slice(2)
    const old = new Dexie(name)
    old.version(1).stores({ entries: 'id, at, createdAt, updatedAt', symptoms: 'id, order', tags: 'id, group, order' })
    await old.table('entries').add({ id: 'a', at: '2026-01-01T00:00:00.000Z', endedAt: null, ongoing: false, readings: { pain: 6, fog: 2 }, regions: ['152'], tags: ['rest'], note: '', createdAt: 'x', updatedAt: 'x' })
    await old.table('entries').add({ id: 'b', at: '2026-01-02T00:00:00.000Z', endedAt: null, ongoing: false, readings: { pain: 2 }, regions: [], tags: [], note: '', createdAt: 'x', updatedAt: 'x' })
    old.close()
    const fresh = resetDb(name)
    const a = (await fresh.entries.get('a')) as unknown as Record<string, unknown>
    const b = await fresh.entries.get('b')
    expect(a.layers).toEqual([L(['152'], { pain: 6, fog: 2 }, ['rest'])])
    expect(a.regions).toBeUndefined()
    expect(a.areas).toBeUndefined()
    expect(a.readings).toBeUndefined()
    expect(a.tags).toBeUndefined()
    expect(b?.layers).toEqual([L([], { pain: 2 })])
  })

  it('round-trips through a draft', async () => {
    const e = await addEntry({ layers: [{ regions: ['154'], readings: { pain: 5 }, tags: ['rest'] }], note: ' n ' })
    const d = draftFromEntry(e)
    expect(d.at).toBe(e.at)
    const input = draftToInput(d)
    expect(input.note).toBe('n')
    expect(input.layers).toEqual([L(['154'], { pain: 5 }, ['rest'])])
    const fresh = draftToInput(emptyDraft({ pain: 4 }))
    expect(fresh.layers).toEqual([L([], { pain: 4 })])
    expect(Date.parse(fresh.at!)).toBeGreaterThan(Date.now() - 5000)
  })
})
