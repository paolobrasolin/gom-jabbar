import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './db'
import { addEntry, updateEntry, editEntry, deleteEntry, restoreEntries, endEpisode, reopenEpisode, activeEpisodes, durationMs, makeEntry, logUpdate, loadEpisode, latest, chainLayers, timeProblem, episodesOf, isHead, isUpdate, isActive, isStale } from './entries'
import { draftFromEntry, draftToInput, emptyDraft } from './draft'
import { DEFAULT_SYMPTOMS } from './vocabulary'
import { selectLayer } from './layers'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
})

const L = (regions: string[], readings: Record<string, number>, tags: string[] = []) => ({ regions, readings, tags })

describe('entries', () => {
  it('seeds vocabulary on first open', async () => {
    expect(await db.symptoms.count()).toBeGreaterThan(3)
    expect(await db.tags.count()).toBeGreaterThan(5)
    expect((await db.symptoms.get('pain'))?.label).toBe('i18n:vocab.pain')
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

  it('active episodes are read in one go: a chain deleted meanwhile is either all there or not at all', async () => {
    const a = await addEntry({ at: '2026-09-01T10:00:00.000Z', kind: 'episode', readings: { pain: 6 } })
    const b = await addEntry({ at: '2026-09-01T11:00:00.000Z', kind: 'episode', readings: { pain: 5 } })
    await logUpdate(b.id, [{ pain: 4 }], '2026-09-01T12:00:00.000Z')
    const [got] = await Promise.all([activeEpisodes(), deleteEntry(b.id)])
    expect(got.every((ep) => ep?.head)).toBe(true)
    expect(got.map((ep) => ep.head.id)).toContain(a.id)
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
    // Tags are what was done at this reading: given ones are stored, and nothing is copied from the reading before.
    const tagged = await logUpdate(e.id, [{ pain: 3 }], '2026-01-01T15:00:00.000Z', [['rest'], undefined])
    expect(tagged?.layers.map((l) => l.tags)).toEqual([['rest'], []])
    const again = await logUpdate(e.id, [], '2026-01-01T16:00:00.000Z')
    expect(again?.layers.map((l) => l.tags)).toEqual([[], []])
    expect(again?.layers.map((l) => l.readings)).toEqual([{ pain: 3, swelling: 6 }, { fog: 2 }])
    const ep = await loadEpisode(e.id)
    expect(ep?.head.id).toBe(e.id)
    expect(ep?.updates.map((x) => x.at)).toEqual(['2026-01-01T12:00:00.000Z', '2026-01-01T14:00:00.000Z', '2026-01-01T15:00:00.000Z', '2026-01-01T16:00:00.000Z'])
    expect(latest(ep!).id).toBe(again!.id)
    expect(latest({ head: e, updates: [] }).id).toBe(e.id)
    expect(await logUpdate('nope', [])).toBeUndefined()
    expect(await loadEpisode('nope')).toBeUndefined()
  })

  it("an update copies the levels and places, never the tags of the start, and keeps its own note", async () => {
    const e = await addEntry({ kind: 'episode', at: '2026-01-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 7 }, tags: ['badsleep', 'heat'] }] })
    const u = await logUpdate(e.id, [{ pain: 5 }], '2026-01-01T12:00:00.000Z', undefined, '  meglio dopo il caffè ')
    expect(u?.layers).toEqual([L(['152'], { pain: 5 })])
    expect(u?.note).toBe('meglio dopo il caffè')
    expect((await db.entries.get(e.id))?.layers[0].tags).toEqual(['badsleep', 'heat'])
  })

  it("an episode's row reads its latest reading's layers, with every tag of the episode once, in order", async () => {
    const e = await addEntry({ kind: 'episode', at: '2026-01-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 7 }, tags: ['badsleep', 'rest'] }, { regions: ['mind'], readings: { fog: 3 } }] })
    await logUpdate(e.id, [{ pain: 5 }, undefined], '2026-01-01T12:00:00.000Z', [['heat'], ['rest']])
    await logUpdate(e.id, [{ pain: 3 }], '2026-01-01T14:00:00.000Z')
    const ep = (await loadEpisode(e.id))!
    expect(chainLayers(ep)).toEqual([L(['152'], { pain: 3 }, ['badsleep', 'rest', 'heat']), L(['mind'], { fog: 3 })])
    expect(chainLayers({ head: e, updates: [] })).toEqual(e.layers)
  })

  it("an ended episode's row reads the layers of the reading it is shown by, its worst, as its pill does (#114)", async () => {
    const e = await addEntry({ kind: 'episode', at: '2026-01-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 6 }, tags: ['rest'] }, { regions: ['mind'], readings: { fog: 4 } }] })
    await logUpdate(e.id, [{ pain: 2 }, { fog: 2 }], '2026-01-01T12:00:00.000Z')
    await endEpisode(e.id, '2026-01-01T13:00:00.000Z')
    const ep = (await loadEpisode(e.id))!
    expect(chainLayers(ep)).toEqual([L(['152'], { pain: 6 }, ['rest']), L(['mind'], { fog: 4 })])
  })

  it("names what is wrong with an episode's times: an end before its start, a reading outside its episode", () => {
    const T = (h: number) => `2026-01-01T${String(h).padStart(2, '0')}:00:00.000Z`
    expect(timeProblem({ at: T(10), endedAt: T(9) })).toBe('end-before-start')
    expect(timeProblem({ at: T(10), endedAt: T(10) })).toBeNull()
    // The chips work in minutes: an end pressed a moment before Salva resolves "Adesso" is not before the start.
    expect(timeProblem({ at: '2026-01-01T10:00:30.000Z', endedAt: '2026-01-01T10:00:00.500Z' })).toBeNull()
    expect(timeProblem({ at: '2026-01-01T10:01:00.000Z', endedAt: '2026-01-01T10:00:59.000Z' })).toBe('end-before-start')
    expect(timeProblem({ at: T(10), endedAt: null })).toBeNull()
    expect(timeProblem({ at: T(10) })).toBeNull()
    // An update may not come before its head, nor a head after its first update.
    expect(timeProblem({ at: T(8) }, { notBefore: T(9) })).toBe('before-start')
    expect(timeProblem({ at: T(11) }, { notAfter: T(10) })).toBe('after-update')
    expect(timeProblem({ at: T(10) }, { notBefore: T(9), notAfter: T(11) })).toBeNull()
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

  it('orders readings at the same time by their migrated number, then by when they were written (#115)', async () => {
    // Histories split in version 8 (§8) can hold two points at one time, ids `<head>:<n>`, createdAt the same as at.
    const at = '2026-01-01T12:00:00.000Z'
    const head = { ...makeEntry({ kind: 'episode', at: '2026-01-01T10:00:00.000Z', readings: { pain: 7 } }), id: 'h' }
    head.episodeId = 'h'
    const point = (n: number, pain: number) => ({ ...makeEntry({ kind: 'episode', at, readings: { pain } }), id: `h:${n}`, episodeId: 'h', createdAt: at })
    // As text "h:10" sorts before "h:2", the order Dexie hands them over in.
    expect(episodesOf([head, point(10, 2), point(2, 5)]).get('h')?.updates.map((u) => u.id)).toEqual(['h:2', 'h:10'])
    await db.entries.bulkAdd([head, point(10, 2), point(2, 5)])
    expect(latest((await loadEpisode('h'))!).id).toBe('h:10')
    // Readings logged since have random ids: the one written later is the later reading.
    const first = { ...makeEntry({ kind: 'episode', at, readings: { pain: 3 } }), id: 'zz', episodeId: 'h', createdAt: '2026-01-01T12:00:01.000Z' }
    const second = { ...makeEntry({ kind: 'episode', at, readings: { pain: 1 } }), id: 'aa', episodeId: 'h', createdAt: '2026-01-01T12:00:02.000Z' }
    expect(episodesOf([head, second, first]).get('h')?.updates.map((u) => u.id)).toEqual(['zz', 'aa'])
    // Nothing else tells them apart: the id does, so the order never depends on how they were loaded.
    const twin = { ...second, id: 'bb' }
    expect(episodesOf([head, twin, second]).get('h')?.updates.map((u) => u.id)).toEqual(['aa', 'bb'])
  })

  it('calls an episode stale after 24 h without a reading; a new reading or its end answers that (#115)', async () => {
    const T = (h: number) => new Date(Date.parse('2026-01-01T10:00:00.000Z') + h * 3600_000).toISOString()
    const e = await addEntry({ at: T(0), kind: 'episode', readings: { pain: 6 } })
    const at = (h: number) => Date.parse(T(h))
    expect(isStale((await loadEpisode(e.id))!, at(23.9))).toBe(false)
    expect(isStale((await loadEpisode(e.id))!, at(24))).toBe(true)
    // A reading later counts from itself, not from the start.
    await logUpdate(e.id, [{ pain: 3 }], T(20))
    expect(isStale((await loadEpisode(e.id))!, at(30))).toBe(false)
    expect(isStale((await loadEpisode(e.id))!, at(44))).toBe(true)
    await endEpisode(e.id, T(21))
    expect(isStale((await loadEpisode(e.id))!, at(100))).toBe(false)
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

  it('refuses to turn an episode start with updates into anything else, whatever the form sends (#115)', async () => {
    const e = await addEntry({ at: '2026-09-01T10:00:00.000Z', kind: 'episode', readings: { pain: 6 } })
    const u = await logUpdate(e.id, [{ pain: 3 }], '2026-09-01T11:00:00.000Z')
    const stored = await db.entries.get(e.id)
    await expect(editEntry(e.id, { kind: 'chronic', episodeId: undefined, endedAt: undefined })).rejects.toThrow()
    await expect(editEntry(e.id, { episodeId: 'elsewhere' })).rejects.toThrow()
    // Nothing was written: the start and its update are as they were.
    expect(await db.entries.get(e.id)).toEqual(stored)
    expect((await loadEpisode(e.id))?.updates.map((x) => x.id)).toEqual([u!.id])
    // Its end and everything else still move.
    expect((await editEntry(e.id, { endedAt: '2026-09-01T12:00:00.000Z', note: 'ok' })).after).toMatchObject({ kind: 'episode', note: 'ok' })
  })

  it('an edit hands back the row as it was, and restoring it undoes the edit exactly', async () => {
    const e = await addEntry({ at: '2026-09-01T10:00:00.000Z', kind: 'episode', readings: { pain: 6 }, note: 'a' })
    await endEpisode(e.id, '2026-09-01T12:00:00.000Z')
    const stored = await db.entries.get(e.id)
    const { before, after } = await editEntry(e.id, { kind: 'chronic', episodeId: undefined, endedAt: undefined, note: 'b', layers: [L([], { pain: 2 })] })
    expect(before).toEqual(stored)
    expect(after).toMatchObject({ kind: 'chronic', note: 'b' })
    expect(after).not.toHaveProperty('episodeId')
    await restoreEntries([before!])
    expect(await db.entries.get(e.id)).toEqual(stored)
    expect(await editEntry('nope', { note: 'x' })).toEqual({ before: undefined, after: undefined })
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
    // The draft's layers remember what they held; finalize leaves it out of the row.
    expect(input.layers).toEqual([{ ...L(['154'], { pain: 5 }, ['rest']), had: { regions: ['154'], readings: { pain: 5 } } }])
    const fresh = draftToInput(emptyDraft())
    expect(fresh.layers).toEqual([L([], {})])
    expect(Date.parse(fresh.at!)).toBeGreaterThan(Date.now() - 5000)
  })
})

describe('an edit never drops a reading the entry already had', () => {
  // The 6 → 7 shape (§8): a mental reading placed on the first body layer, which the form does not show there.
  const migrated = async (layers: ReturnType<typeof L>[], extra: Record<string, unknown> = {}) => {
    const e = { id: 'm1', kind: 'chronic' as const, at: '2026-09-10T10:00:00.000Z', layers, note: '', createdAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-10T10:00:00.000Z', ...extra }
    await db.entries.add(e)
    return e
  }

  it('keeps a hidden reading the stored layer had, at the value it had', async () => {
    const e = await migrated([L(['152'], { pain: 7, fog: 4 })])
    const d = draftFromEntry(e)
    d.layers[0].readings.pain = 6
    const u = await updateEntry(e.id, { layers: draftToInput(d).layers as never })
    expect(u?.layers).toEqual([L(['152'], { pain: 6, fog: 4 })])
  })

  it('a mind-only reading on a body layer survives an edit of the note', async () => {
    const e = await migrated([L(['152'], { pain: 6, fog: 4 })])
    const d = draftFromEntry(e)
    const u = await updateEntry(e.id, { layers: draftToInput(d).layers as never, note: 'x' })
    expect(u?.layers[0].readings).toEqual({ pain: 6, fog: 4 })
  })

  it('a hidden reading the draft changed is not kept (deselecting the brain drops what was set there, §6.1)', async () => {
    const e = await migrated([L(['152'], { pain: 7, fog: 4 })])
    const d = draftFromEntry(e)
    d.layers[0].readings.fog = 6
    const u = await updateEntry(e.id, { layers: draftToInput(d).layers as never })
    expect(u?.layers).toEqual([L(['152'], { pain: 7 })])
  })

  it('deselecting the brain on an edited entry still drops the mental reading it showed (§6.1 item 8)', async () => {
    const e = await migrated([L(['152', 'mind'], { pain: 7, fog: 4 })])
    const d = draftFromEntry(e)
    d.layers[0].regions = ['152']
    const u = await updateEntry(e.id, { layers: draftToInput(d).layers as never })
    expect(u?.layers).toEqual([L(['152'], { pain: 7 })])
  })

  it('a new hidden reading is still dropped', async () => {
    const e = await migrated([L(['152'], { pain: 7 })])
    const d = draftFromEntry(e)
    d.layers[0].readings.anxiety = 3
    const u = await updateEntry(e.id, { layers: draftToInput(d).layers as never })
    expect(u?.layers).toEqual([L(['152'], { pain: 7 })])
  })

  it('identity follows the layer, not its index: removing the layer before it neither keeps nor drops the wrong reading', async () => {
    // Stored: legs with a misplaced fog 4, arms with pain 3.
    const e = await migrated([L(['152'], { pain: 7, fog: 4 }), L(['110'], { pain: 3 })])
    const d = draftFromEntry(e)
    // On the arms layer the tester selects the brain, sets fog 4, deselects it: §6.1 says that reading does not survive.
    d.layers[1].readings.fog = 4
    // Then empties the legs layer and taps the arms tab: the form prunes the empty layer (EntryForm → selectLayer).
    d.layers[0].regions = []
    const st = selectLayer({ layers: d.layers, cur: 0 }, 1)
    d.layers = st.layers
    d.cur = st.cur
    expect(d.layers).toHaveLength(1)
    const u = await updateEntry(e.id, { layers: draftToInput(d).layers as never })
    expect(u?.layers).toEqual([L(['110'], { pain: 3 })])
  })

  it('an added layer after a migrated one leaves both intact', async () => {
    const e = await migrated([L(['152'], { pain: 7, fog: 4 })])
    const d = draftFromEntry(e)
    d.layers.push({ regions: ['110'], readings: { pain: 2 }, tags: [] })
    const u = await updateEntry(e.id, { layers: draftToInput(d).layers as never })
    expect(u?.layers).toEqual([L(['152'], { pain: 7, fog: 4 }), L(['110'], { pain: 2 })])
  })

  it('Aggiorna on a migrated episode keeps the misplaced reading, at the level the sheet set', async () => {
    const e = await migrated([L(['152'], { pain: 5, fog: 3 })], { kind: 'episode', episodeId: 'm1', endedAt: null })
    const same = await logUpdate(e.id, [{ pain: 6 }], '2026-09-10T12:00:00.000Z')
    expect(same?.layers[0].readings).toEqual({ pain: 6, fog: 3 })
    // The episode sheet shows a slider for every reading above 0 on the layer, fog included: moving it is kept.
    const moved = await logUpdate(e.id, [{ pain: 6, fog: 1 }], '2026-09-10T13:00:00.000Z')
    expect(moved?.layers[0].readings).toEqual({ pain: 6, fog: 1 })
    // A reading the latest did not have is still filtered by what the layer shows.
    const fresh = await logUpdate(e.id, [{ anxiety: 2 }], '2026-09-10T14:00:00.000Z')
    expect(fresh?.layers[0].readings).toEqual({ pain: 6, fog: 1 })
  })

  it('editing a v7 → 8 update keeps the reading the migration copied onto it', async () => {
    await migrated([L(['152'], { pain: 5, fog: 3 })], { kind: 'episode', episodeId: 'm1', endedAt: null })
    const u = { id: 'm1:1', kind: 'episode' as const, episodeId: 'm1', at: '2026-09-10T11:00:00.000Z', layers: [L(['152'], { pain: 4, fog: 3 })], note: '', createdAt: '2026-09-10T11:00:00.000Z', updatedAt: '2026-09-10T11:00:00.000Z' }
    await db.entries.add(u)
    const d = draftFromEntry(u)
    const got = await updateEntry(u.id, { layers: draftToInput(d).layers as never, at: '2026-09-10T11:30:00.000Z' })
    expect(got?.layers[0].readings).toEqual({ pain: 4, fog: 3 })
  })
})
