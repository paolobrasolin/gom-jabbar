import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './db'
import { addEntry, updateEntry } from './entries'
import { buildExport, parseImport, previewImport, applyImport, toCsv, backupDue, exportFilename } from './backup'
import { addSymptom, addTag, rename, setEnabled, move } from './vocab'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
})

const t = (k: string) => k

describe('backup', () => {
  it('round-trips export → parse → replace', async () => {
    await addEntry({ areas: [{ regions: ['152'], intensity: 6 }], tags: ['rest'], note: 'x' })
    await addEntry({ ongoing: true, areas: [{ regions: ['*'], intensity: 9 }] })
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

  it('upgrades a version 1 file with regions', async () => {
    const text = JSON.stringify({
      app: 'gom-jabbar',
      version: 1,
      entries: [{ id: 'v1', at: '2026-01-01T00:00:00.000Z', readings: { pain: 5 }, regions: ['154'], tags: [], note: '' }],
    })
    const parsed = parseImport(text)
    expect(parsed.entries[0].areas).toEqual([{ regions: ['154'], intensity: 5 }])
    expect(parsed.entries[0].updatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(parsed.vocabulary.tags).toEqual([])
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
    expect(parsed.vocabulary.symptoms[2]).toEqual(symptoms[2])
  })

  it('replace with an empty vocabulary keeps the defaults', async () => {
    const parsed = parseImport(JSON.stringify({ app: 'gom-jabbar', version: 2, entries: [] }))
    await applyImport(parsed, 'replace')
    expect(await db.symptoms.count()).toBeGreaterThan(3)
    expect(await db.tags.count()).toBeGreaterThan(5)
  })

  it('rejects garbage', () => {
    expect(() => parseImport('nope')).toThrow('invalid-json')
    expect(() => parseImport('{"app":"other","entries":[]}')).toThrow('invalid-file')
    expect(() => parseImport('{"app":"gom-jabbar","entries":[{"id":1}]}')).toThrow('invalid-entry')
  })

  it('writes csv with one row per entry and escaped notes', async () => {
    await addEntry({ areas: [{ regions: ['152', '153'], intensity: 6 }], readings: { swelling: 3 }, tags: ['rest'], note: 'he said "ow", twice' })
    const file = await buildExport()
    const csv = toCsv(file.entries, file.vocabulary.symptoms, file.vocabulary.tags, 'it', t)
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[0].startsWith('id,at,endedAt,ongoing,pain,swelling')).toBe(true)
    expect(lines[1]).toContain('152+153:6')
    expect(lines[1]).toContain('Riposo')
    expect(lines[1]).toContain('"he said ""ow"", twice"')
  })

  it('decides when a backup is due', () => {
    const now = Date.parse('2026-03-01T00:00:00Z')
    const old = '2026-01-01T00:00:00Z'
    const recent = '2026-02-25T00:00:00Z'
    expect(backupDue(null, null, null, now)).toBe(false)
    expect(backupDue(null, old, null, now)).toBe(true)
    expect(backupDue(null, recent, null, now)).toBe(false)
    expect(backupDue(recent, old, null, now)).toBe(false)
    expect(backupDue(old, old, null, now)).toBe(true)
    expect(backupDue(old, old, '2026-03-05T00:00:00Z', now)).toBe(false)
    expect(exportFilename('json', new Date(2026, 0, 5))).toBe('gom-jabbar-20260105.json')
  })
})

describe('vocab', () => {
  it('adds, renames, toggles and reorders', async () => {
    const s = await addSymptom('Formicolio')
    expect(s.label).toEqual({ it: 'Formicolio', en: 'Formicolio' })
    expect(s.category).toBe('body')
    expect(s.order).toBeGreaterThan(0)
    const m = await addSymptom('Ansia', 'mind')
    expect(m.category).toBe('mind')
    // Symptoms move within their category: fog swaps with anxiety, the body ones stay put.
    await move('symptoms', 'fog', 1)
    expect((await db.symptoms.orderBy('order').toArray()).filter((x) => x.category === 'mind').map((x) => x.id)).toEqual(['anxiety', 'fog', 'depression', m.id])
    expect((await db.symptoms.get('tenderness'))?.order).toBe(5)
    await rename('symptoms', s.id, 'en', 'Tingling')
    expect((await db.symptoms.get(s.id))?.label).toEqual({ it: 'Tingling', en: 'Tingling' })
    await rename('symptoms', 'pain', 'it', 'Male')
    expect((await db.symptoms.get('pain'))?.label).toEqual({ it: 'Male', en: 'Pain' })
    await setEnabled('symptoms', 'pain', false)
    expect((await db.symptoms.get('pain'))?.enabled).toBe(true)
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
    await addEntry({ areas: [{ regions: ['152'], intensity: 6, strokes }] })
    const text = JSON.stringify(await buildExport())
    resetDb()
    await applyImport(parseImport(text), 'replace')
    const again = await buildExport()
    expect(again.entries[0].areas[0].strokes).toEqual(strokes)
    expect(JSON.stringify(again.entries)).toBe(JSON.stringify(JSON.parse(text).entries))
  })
})
