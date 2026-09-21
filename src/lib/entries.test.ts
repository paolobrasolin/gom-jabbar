import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './db'
import { addEntry, updateEntry, deleteEntry, restoreEntries, endEpisode, reopenEpisode, activeEpisodes, durationMs, makeEntry, logUpdate, loadEpisode, latest, episodesOf, isHead, isUpdate, isActive } from './entries'
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
    expect(e.kind).toBe('chronic')
    expect(e).not.toHaveProperty('endedAt')
    expect(e).not.toHaveProperty('episodeId')
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

  it('an episode is its own head: kind, episodeId and a null end; an end makes it over from the start', async () => {
    const e = await addEntry({ at: '2026-09-01T10:00:00.000Z', kind: 'episode', readings: { pain: 6 } })
    expect(e).toMatchObject({ kind: 'episode', episodeId: e.id, endedAt: null })
    expect(isHead(e)).toBe(true)
    expect(isActive(e)).toBe(true)
    expect(isUpdate(e)).toBe(false)
    const over = await addEntry({ at: '2026-09-01T10:00:00.000Z', kind: 'episode', endedAt: '2026-09-01T13:30:00.000Z', readings: { pain: 6 } })
    expect(over).toMatchObject({ kind: 'episode', episodeId: over.id, endedAt: '2026-09-01T13:30:00.000Z' })
    expect(isActive(over)).toBe(false)
    expect(durationMs(over)).toBe(3.5 * 3600_000)
    expect((await activeEpisodes()).map((x) => x.head.id)).toEqual([e.id])
    // A chronic snapshot never carries an end, whatever the input says.
    expect(makeEntry({ endedAt: '2026-09-01T13:30:00.000Z' })).not.toHaveProperty('endedAt')
  })

  it('runs an episode lifecycle', async () => {
    const e = await addEntry({ readings: { pain: 7 }, kind: 'episode', at: '2026-01-01T10:00:00.000Z' })
    expect((await activeEpisodes()).map((x) => x.head.id)).toEqual([e.id])
    expect(durationMs(e, Date.parse('2026-01-01T13:00:00.000Z'))).toBe(3 * 3600_000)
    const ended = await endEpisode(e.id, '2026-01-01T12:30:00.000Z')
    expect(ended?.endedAt).toBe('2026-01-01T12:30:00.000Z')
    expect(durationMs(ended!)).toBe(2.5 * 3600_000)
    expect(await activeEpisodes()).toEqual([])
    const back = await reopenEpisode(e.id)
    expect(back?.endedAt).toBeNull()
    expect(durationMs(makeEntry({}))).toBeNull()
    expect(await endEpisode('nope')).toBeUndefined()
    expect(await reopenEpisode('nope')).toBeUndefined()
    // Neither works on a chronic snapshot or an update.
    const c = await addEntry({ readings: { pain: 1 } })
    expect(await endEpisode(c.id)).toBeUndefined()
    expect(await reopenEpisode(c.id)).toBeUndefined()
  })

  it('logs updates as readings chained to the head, each from where the episode stands', async () => {
    const e = await addEntry({ kind: 'episode', at: '2026-01-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 7, swelling: 3 } }, { regions: ['mind'], readings: { fog: 5 } }] })
    const u = await logUpdate(e.id, [{ pain: 4, swelling: 6 }], '2026-01-01T12:00:00.000Z')
    expect(u).toMatchObject({ kind: 'episode', episodeId: e.id, at: '2026-01-01T12:00:00.000Z', note: '' })
    expect(u).not.toHaveProperty('endedAt')
    expect(isUpdate(u!)).toBe(true)
    expect(u?.layers).toEqual([L(['152'], { pain: 4, swelling: 6 }), L(['mind'], { fog: 5 })])
    // The head is untouched: it is the start.
    expect((await db.entries.get(e.id))?.layers).toEqual([L(['152'], { pain: 7, swelling: 3 }), L(['mind'], { fog: 5 })])
    const w = await logUpdate(e.id, [undefined, { fog: 2 }], '2026-01-01T14:00:00.000Z')
    expect(w?.layers.map((l) => l.readings)).toEqual([{ pain: 4, swelling: 6 }, { fog: 2 }])
    // Tags per layer travel with an update; an omitted list keeps the latest reading's.
    const tagged = await logUpdate(e.id, [{ pain: 3 }], '2026-01-01T15:00:00.000Z', [['rest'], undefined])
    expect(tagged?.layers.map((l) => l.tags)).toEqual([['rest'], []])
    const again = await logUpdate(e.id, [], '2026-01-01T16:00:00.000Z')
    expect(again?.layers.map((l) => l.tags)).toEqual([['rest'], []])
    const ep = await loadEpisode(e.id)
    expect(ep?.head.id).toBe(e.id)
    expect(ep?.updates.map((x) => x.at)).toEqual(['2026-01-01T12:00:00.000Z', '2026-01-01T14:00:00.000Z', '2026-01-01T15:00:00.000Z', '2026-01-01T16:00:00.000Z'])
    expect(latest(ep!).id).toBe(again!.id)
    expect(latest({ head: e, updates: [] }).id).toBe(e.id)
    expect(await logUpdate('nope', [])).toBeUndefined()
    expect(await loadEpisode('nope')).toBeUndefined()
  })

  it('groups loaded rows into episodes, updates in time order, orphans left out', () => {
    const head = makeEntry({ kind: 'episode', at: '2026-01-01T10:00:00.000Z', readings: { pain: 7 } })
    const late = { ...makeEntry({ kind: 'episode', at: '2026-01-01T14:00:00.000Z', readings: { pain: 2 } }), episodeId: head.id }
    const early = { ...makeEntry({ kind: 'episode', at: '2026-01-01T12:00:00.000Z', readings: { pain: 4 } }), episodeId: head.id }
    const orphan = { ...makeEntry({ kind: 'episode', at: '2026-01-01T12:00:00.000Z', readings: { pain: 4 } }), episodeId: 'gone' }
    const chronic = makeEntry({ readings: { pain: 1 } })
    const eps = episodesOf([late, chronic, head, orphan, early])
    expect([...eps.keys()]).toEqual([head.id])
    expect(eps.get(head.id)?.updates.map((u) => u.id)).toEqual([early.id, late.id])
  })

  it('updates, deletes and restores', async () => {
    const e = await addEntry({ readings: { pain: 3 } })
    const u = await updateEntry(e.id, { note: 'hi', layers: [{ regions: ['*', '110'], readings: { pain: 9, fog: 1 }, tags: [] }] })
    expect(u?.note).toBe('hi')
    expect(u?.layers).toEqual([L(['*'], { pain: 9 })])
    expect(u!.updatedAt >= e.updatedAt).toBe(true)
    const gone = await deleteEntry(e.id)
    expect(gone.map((g) => g.id)).toEqual([e.id])
    expect(await db.entries.count()).toBe(0)
    await restoreEntries(gone)
    expect(await db.entries.count()).toBe(1)
    expect(await deleteEntry('nope')).toEqual([])
  })

  it('deleting a head takes its chain along, and restoring brings it all back', async () => {
    const e = await addEntry({ kind: 'episode', readings: { pain: 7 }, at: '2026-01-01T10:00:00.000Z' })
    const u = await logUpdate(e.id, [{ pain: 3 }], '2026-01-01T12:00:00.000Z')
    await addEntry({ readings: { pain: 1 } })
    const gone = await deleteEntry(e.id)
    expect(gone.map((g) => g.id).sort()).toEqual([e.id, u!.id].sort())
    expect(await db.entries.count()).toBe(1)
    await restoreEntries(gone)
    expect(await db.entries.count()).toBe(3)
    // Deleting an update leaves the head.
    expect((await deleteEntry(u!.id)).map((g) => g.id)).toEqual([u!.id])
    expect(await db.entries.get(e.id)).toBeDefined()
  })

  it('upgrades a version 1 database with regions all the way to layers', async () => {
    const { default: Dexie } = await import('dexie')
    const name = 'gj-migrate-' + Math.random().toString(36).slice(2)
    const old = new Dexie(name)
    old.version(1).stores({ entries: 'id, at, createdAt, updatedAt', symptoms: 'id, order', tags: 'id, group, order' })
    await old.table('entries').add({ id: 'a', at: '2026-01-01T00:00:00.000Z', endedAt: null, ongoing: false, readings: { pain: 6, fog: 2 }, regions: ['152'], tags: ['rest'], note: '', createdAt: 'x', updatedAt: 'x' })
    await old.table('entries').add({ id: 'b', at: '2026-01-02T00:00:00.000Z', endedAt: null, ongoing: true, readings: { pain: 2 }, regions: [], tags: [], note: '', createdAt: 'x', updatedAt: 'x', history: [{ at: '2026-01-02T01:00:00.000Z', pain: 4 }] })
    old.close()
    const fresh = resetDb(name)
    const a = (await fresh.entries.get('a')) as unknown as Record<string, unknown>
    const b = await fresh.entries.get('b')
    expect(a.layers).toEqual([L(['152'], { pain: 6, fog: 2 }, ['rest'])])
    expect(a.regions).toBeUndefined()
    expect(a.areas).toBeUndefined()
    expect(a.readings).toBeUndefined()
    expect(a.tags).toBeUndefined()
    expect(a.kind).toBe('chronic')
    expect(a.ongoing).toBeUndefined()
    expect(b).toMatchObject({ kind: 'episode', episodeId: 'b', endedAt: null, layers: [L([], { pain: 2 })] })
    expect(b).not.toHaveProperty('history')
    expect(await fresh.entries.get('b:1')).toMatchObject({ kind: 'episode', episodeId: 'b', at: '2026-01-02T01:00:00.000Z', layers: [L([], { pain: 4 })] })
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
