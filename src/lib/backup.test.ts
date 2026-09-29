import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resetDb } from './db'
import { addEntry, updateEntry } from './entries'
import { buildExport, parseImport, previewImport, applyImport, backupReminder, exportFilename, shareOrDownload, REMIND, EXPORT_VERSION } from './backup'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from './vocabulary'
import { addPreset } from './presets'

const DAY = 86_400_000
import { addSymptom, addTag, rename, setEnabled, move } from './vocab'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
})


describe('backup', () => {
  it('round-trips export → parse → replace', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 6 }, tags: ['rest'] }], note: 'x' })
    await addEntry({ kind: 'episode', layers: [{ regions: ['*'], readings: { pain: 9 } }] })
    const file = await buildExport()
    expect(file.entries).toHaveLength(2)
    expect(file.vocabulary.symptoms.length).toBeGreaterThan(3)
    const text = JSON.stringify(file)
    const other = resetDb()
    const parsed = parseImport(text)
    const res = await applyImport(parsed, 'replace')
    expect(res.added).toBe(2)
    expect(await other.entries.count()).toBe(2)
    expect((await other.entries.toArray()).map((e) => e.note).sort()).toEqual(['', 'x'])
  })

  it('merges by id with newer updatedAt winning', async () => {
    const a = await addEntry({ note: 'old' })
    const b = await addEntry({ note: 'keep' })
    const file = await buildExport()
    // local edit after export → export must not overwrite it
    await new Promise((r) => setTimeout(r, 5))
    await updateEntry(b.id, { note: 'newer local' })
    // exported copy of a is edited later than local → wins
    const fa = file.entries.find((e) => e.id === a.id)!
    fa.note = 'from file'
    fa.updatedAt = new Date(Date.now() + 1000).toISOString()
    file.entries.push({ ...fa, id: 'brand-new', note: 'new' })
    const preview = await previewImport(file)
    expect(preview).toMatchObject({ entries: 3, added: 1, updated: 1, unchanged: 1 })
    await applyImport(file, 'merge')
    expect((await db.entries.get(a.id))?.note).toBe('from file')
    expect((await db.entries.get(b.id))?.note).toBe('newer local')
    expect(await db.entries.count()).toBe(3)
  })

  it('upgrades a version 1 file with regions all the way to layers', async () => {
    const text = JSON.stringify({
      app: 'gom-jabbar',
      version: 1,
      entries: [{ id: 'v1', at: '2026-01-01T00:00:00.000Z', readings: { pain: 5, fog: 2 }, regions: ['154'], tags: ['rest'], note: '', history: [{ at: 'h', pain: 6 }] }],
    })
    const parsed = parseImport(text)
    expect(parsed.entries[0].layers).toEqual([{ regions: ['154'], readings: { pain: 5, fog: 2 }, tags: ['rest'] }])
    // A version 1 history point sits after the start: the head keeps its readings, the point is an update.
    expect(parsed.entries.map((e) => e.id)).toEqual(['v1', 'v1:1'])
    expect(parsed.entries[0]).toMatchObject({ kind: 'episode', episodeId: 'v1', endedAt: null })
    expect(parsed.entries[1]).toMatchObject({ kind: 'episode', episodeId: 'v1', at: 'h', layers: [{ regions: ['154'], readings: { pain: 6 }, tags: [] }] })
    expect(parsed.entries[0]).not.toHaveProperty('readings')
    expect(parsed.entries[0]).not.toHaveProperty('areas')
    expect(parsed.entries[0]).not.toHaveProperty('tags')
    expect(parsed.entries[0].updatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(parsed.vocabulary.tags).toEqual(DEFAULT_TAGS)
  })

  it('upgrades a version 6 file: readings by category, tags on the first layer, presets too; a version 7 entry without layers gets one', () => {
    const file = {
      app: 'gom-jabbar',
      version: 6,
      vocabulary: { symptoms: [{ id: 'x_mind', label: { it: 'X', en: 'X' }, category: 'mind', enabled: true, order: 9 }], tags: [] },
      entries: [{ id: 'a', at: '2026-01-01T00:00:00.000Z', readings: { pain: 4, x_mind: 3, fog: 1 }, areas: [{ regions: ['*'], intensity: 4 }, { regions: ['mind'], intensity: 3 }], tags: ['t'], note: '' }],
      presets: [{ id: 'p', name: 'P', areas: [{ regions: ['224'], intensity: 5 }], symptomIds: ['pain'], tags: ['m'], ongoing: true, order: 0 }],
    }
    const parsed = parseImport(JSON.stringify(file))
    expect(parsed.entries[0].layers).toEqual([{ regions: ['*'], readings: { pain: 4 }, tags: ['t'] }, { regions: ['mind'], readings: { x_mind: 3, fog: 1 }, tags: [] }])
    expect(parsed.presets[0]).toEqual({ id: 'p', name: 'P', layers: [{ regions: ['224'], readings: { pain: 5 }, tags: ['m'], asks: ['pain'] }], kind: 'episode', order: 0 })
    const bare = parseImport(JSON.stringify({ app: 'gom-jabbar', version: 7, entries: [{ id: 'b', at: '2026-01-01T00:00:00.000Z' }] }))
    expect(bare.entries[0].layers).toEqual([{ regions: [], readings: { pain: 0 }, tags: [] }])
  })

  it('gives symptoms without a category the default for their id, and keeps one that is set', () => {
    const symptoms = [
      { id: 'pain', label: { it: 'Dolore', en: 'Pain' }, enabled: true, order: 0 },
      { id: 'fog', label: { it: 'Nebbia', en: 'Fog' }, enabled: true, order: 4 },
      { id: 'ansia_x1', label: { it: 'Ansia', en: 'Ansia' }, category: 'mind', enabled: true, order: 7 },
      { id: 'fog_x2', label: { it: 'Nebbia 2', en: 'Fog 2' }, category: 'body', enabled: false, order: 8 },
    ]
    const parsed = parseImport(JSON.stringify({ app: 'gom-jabbar', version: 5, entries: [], vocabulary: { symptoms, tags: [] } }))
    expect(parsed.vocabulary.symptoms.map((s) => s.category)).toEqual(['body', 'mind', 'mind', 'body'])
    expect(parsed.vocabulary.symptoms[2]).toEqual({ ...symptoms[2], label: 'Ansia' })
  })

  it('reads a file without a vocabulary as one carrying the seed', async () => {
    const parsed = parseImport(JSON.stringify({ app: 'gom-jabbar', version: 2, entries: [] }))
    expect(parsed.vocabulary).toEqual({ symptoms: DEFAULT_SYMPTOMS, tags: DEFAULT_TAGS })
    await applyImport(parsed, 'replace')
    expect(await db.symptoms.count()).toBe(DEFAULT_SYMPTOMS.length)
    expect(await db.tags.count()).toBe(DEFAULT_TAGS.length)
  })

  it('replace with an empty vocabulary leaves it empty: everything was deleted on purpose', async () => {
    const parsed = parseImport(JSON.stringify({ app: 'gom-jabbar', version: EXPORT_VERSION, entries: [], vocabulary: { symptoms: [], tags: [] } }))
    await applyImport(parsed, 'replace')
    expect(await db.symptoms.count()).toBe(0)
    expect(await db.tags.count()).toBe(0)
  })

  it('gives version 9 labels one string: the seed as a dictionary key, the rest as their Italian', () => {
    const symptoms = [
      { id: 'pain', label: { it: 'Dolore', en: 'Ache' }, category: 'body', enabled: true, order: 0 },
      { id: 'fog', label: { it: 'Testa vuota', en: 'Brain fog' }, category: 'mind', enabled: true, order: 4 },
      { id: 'x1', label: { it: '', en: 'Nausea' }, category: 'body', enabled: true, order: 9, extra: 1 },
    ]
    const tags = [{ id: 'stress', label: { it: 'Stress', en: 'Stress' }, group: 'context', enabled: false, order: 11 }]
    const parsed = parseImport(JSON.stringify({ app: 'gom-jabbar', version: 9, entries: [], vocabulary: { symptoms, tags } }))
    expect(parsed.vocabulary.symptoms.map((s) => s.label)).toEqual(['i18n:vocab.pain', 'Testa vuota', 'Nausea'])
    expect(parsed.vocabulary.symptoms[2]).toEqual({ ...symptoms[2], label: 'Nausea' })
    expect(parsed.vocabulary.tags).toEqual([{ ...tags[0], label: 'i18n:vocab.stress' }])
  })

  it('rejects garbage', () => {
    expect(() => parseImport('nope')).toThrow('invalid-json')
    expect(() => parseImport('{"app":"other","entries":[]}')).toThrow('invalid-file')
    expect(() => parseImport('{"app":"gom-jabbar","entries":[{"id":1}]}')).toThrow('invalid-entry')
  })

  it('reminds 14 days after the last backup when Drive is not in use, snoozing 7', () => {
    const now = Date.parse('2026-03-01T00:00:00Z')
    const at = (days: number) => new Date(now - days * DAY).toISOString()
    const base = { lastBackupAt: null, lastDriveAt: null, drive: false, oldestEntryAt: null, snoozedUntil: null, now }
    expect(backupReminder(base)).toBeNull()
    expect(backupReminder({ ...base, oldestEntryAt: at(15) })).toEqual({ drive: false, days: null })
    expect(backupReminder({ ...base, oldestEntryAt: at(13) })).toBeNull()
    expect(backupReminder({ ...base, oldestEntryAt: at(60), lastBackupAt: at(13) })).toBeNull()
    expect(backupReminder({ ...base, oldestEntryAt: at(60), lastBackupAt: at(15) })).toEqual({ drive: false, days: null })
    expect(backupReminder({ ...base, oldestEntryAt: at(60), lastBackupAt: at(15), snoozedUntil: at(-1) })).toBeNull()
    expect(REMIND.file).toEqual({ every: 14, snooze: 7 })
  })

  it('reminds 7 days after the last Drive backup when Drive is in use, snoozing 3', () => {
    const now = Date.parse('2026-03-01T00:00:00Z')
    const at = (days: number) => new Date(now - days * DAY).toISOString()
    const base = { lastBackupAt: null, lastDriveAt: null, drive: true, oldestEntryAt: at(60), snoozedUntil: null, now }
    expect(backupReminder({ ...base, lastDriveAt: at(6) })).toBeNull()
    expect(backupReminder({ ...base, lastDriveAt: at(9) })).toEqual({ drive: true, days: 9 })
    // A share-sheet backup yesterday does not stand in for Drive once Drive is the route.
    expect(backupReminder({ ...base, lastDriveAt: at(9), lastBackupAt: at(1) })).toEqual({ drive: true, days: 9 })
    // Connected but never written from this phone: counted from the oldest entry, no number to show.
    expect(backupReminder(base)).toEqual({ drive: true, days: null })
    expect(backupReminder({ ...base, oldestEntryAt: at(5) })).toBeNull()
    expect(backupReminder({ ...base, lastDriveAt: at(9), snoozedUntil: at(-1) })).toBeNull()
    expect(backupReminder({ ...base, oldestEntryAt: null })).toBeNull()
    expect(REMIND.drive).toEqual({ every: 7, snooze: 3 })
  })

  it('merge adds the presets it lacks and keeps its own', async () => {
    const theirs = await addPreset({ name: 'Schiena', layers: [{ regions: [], asks: ['pain'] }], kind: 'chronic' })
    const file = await buildExport()
    await db.presets.clear()
    const mine = await addPreset({ name: 'Gambe', layers: [{ regions: ['152'], asks: ['pain'] }], kind: 'chronic' })
    await applyImport(file, 'merge')
    expect((await db.presets.toArray()).map((p) => p.name).sort()).toEqual(['Gambe', 'Schiena'])
    // A preset already here is not overwritten by another file's copy of it.
    await applyImport({ ...file, presets: [{ ...file.presets[0], name: 'Schiena da un altro file' }] }, 'merge')
    expect((await db.presets.get(theirs.id))?.name).toBe('Schiena')
    expect(await db.presets.get(mine.id)).toBeDefined()
  })

  it('names export files by date', () => {
    expect(exportFilename('json', new Date(2026, 0, 5))).toBe('gom-jabbar-20260105.json')
  })
})

describe('shareOrDownload', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
  it('downloads when the browser cannot share, and frees the blob afterwards', async () => {
    vi.useFakeTimers()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await shareOrDownload('gom-jabbar-20260105.json', '{}', 'application/json')).toBe('downloaded')
    expect(click).toHaveBeenCalledTimes(1)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })
})

describe('vocab', () => {
  it('adds, renames, toggles and reorders', async () => {
    const s = await addSymptom('Formicolio')
    expect(s.label).toBe('Formicolio')
    expect(s.category).toBe('body')
    expect(s.order).toBeGreaterThan(0)
    const m = await addSymptom('Ansia', 'mind')
    expect(m.category).toBe('mind')
    // Symptoms move within their category: fog swaps with anxiety, the body ones stay put.
    await move('symptoms', 'fog', 1)
    expect((await db.symptoms.orderBy('order').toArray()).filter((x) => x.category === 'mind').map((x) => x.id)).toEqual(['anxiety', 'fog', 'depression', m.id])
    expect((await db.symptoms.get('tenderness'))?.order).toBe(5)
    await rename('symptoms', s.id, 'Tingling')
    expect((await db.symptoms.get(s.id))?.label).toBe('Tingling')
    await rename('symptoms', 'pain', 'Male')
    expect((await db.symptoms.get('pain'))?.label).toBe('Male')
    await setEnabled('symptoms', 'pain', false)
    expect((await db.symptoms.get('pain'))?.enabled).toBe(false)
    await setEnabled('symptoms', 'fog', false)
    expect((await db.symptoms.get('fog'))?.enabled).toBe(false)

    const tag = await addTag('Ibuprofene', 'medication')
    expect(tag.group).toBe('medication')
    const before = (await db.tags.orderBy('order').toArray()).filter((x) => x.group === 'context').map((x) => x.id)
    await move('tags', before[1], -1)
    const after = (await db.tags.orderBy('order').toArray()).filter((x) => x.group === 'context').map((x) => x.id)
    expect(after[0]).toBe(before[1])
    expect(after[1]).toBe(before[0])
    await move('tags', after[0], -1) // already first: no-op
    expect((await db.tags.orderBy('order').toArray()).filter((x) => x.group === 'context')[0].id).toBe(after[0])
  })
})

describe('strokes survive backup', () => {
  it('export → import → export keeps every stroke', async () => {
    const strokes = [{ region: '152', fig: 'female' as const, view: 'front' as const, points: [[100.1, 250.2], [104, 260]] as [number, number][], w: 8 }]
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 6 }, strokes }] })
    const text = JSON.stringify(await buildExport())
    resetDb()
    await applyImport(parseImport(text), 'replace')
    const again = await buildExport()
    expect(again.entries[0].layers[0].strokes).toEqual(strokes)
    expect(JSON.stringify(again.entries)).toBe(JSON.stringify(JSON.parse(text).entries))
  })
})
