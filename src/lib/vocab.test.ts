import { describe, it, expect } from 'vitest'
import { frequentTags } from './vocab'
import { makeEntry } from './entries'
import { DEFAULT_TAGS, DEFAULT_SYMPTOMS, defaultCategory, isMindSymptom, mindMax, firstEnabled } from './vocabulary'

describe('symptom categories', () => {
  it('fog is a mind symptom by default, the rest body; a row without a category reads as its default', () => {
    expect(defaultCategory('fog')).toBe('mind')
    expect(defaultCategory('pain')).toBe('body')
    expect(DEFAULT_SYMPTOMS.filter(isMindSymptom).map((s) => s.id)).toEqual(['fog', 'anxiety', 'depression'])
    expect(isMindSymptom({ ...DEFAULT_SYMPTOMS[4], category: undefined as never })).toBe(true)
    expect(isMindSymptom({ ...DEFAULT_SYMPTOMS[1], category: 'mind' })).toBe(true)
  })
  it('the first enabled symptom of a kind is the headline (§6.1), whatever its id', () => {
    expect(firstEnabled(DEFAULT_SYMPTOMS, 'body')?.id).toBe('pain')
    expect(firstEnabled(DEFAULT_SYMPTOMS, 'mind')?.id).toBe('fog')
    const off = DEFAULT_SYMPTOMS.map((s) => (s.id === 'pain' || s.id === 'fog' ? { ...s, enabled: false } : s))
    expect(firstEnabled(off, 'body')?.id).toBe('swelling')
    expect(firstEnabled(off, 'mind')?.id).toBe('anxiety')
    // Vocabulary order, not array order: swelling moved above pain.
    const moved = DEFAULT_SYMPTOMS.map((s) => (s.id === 'swelling' ? { ...s, order: -1 } : s))
    expect(firstEnabled(moved, 'body')?.id).toBe('swelling')
    expect(firstEnabled(DEFAULT_SYMPTOMS.filter(isMindSymptom), 'body')).toBeUndefined()
    // A row from before version 6 has no category: fog reads as mind.
    expect(firstEnabled([{ ...DEFAULT_SYMPTOMS[4], category: undefined as never }], 'mind')?.id).toBe('fog')
  })
  it('mindMax is the highest mental reading, 0 when none', () => {
    const symptoms = [...DEFAULT_SYMPTOMS, { id: 'irritability', label: 'Irritabilità', category: 'mind' as const, enabled: false, order: 9 }]
    expect(mindMax({ pain: 9, fog: 4, irritability: 7 }, symptoms)).toBe(7)
    expect(mindMax({ anxiety: 3, depression: 5 }, symptoms)).toBe(5)
    expect(mindMax({ pain: 9, swelling: 8 }, symptoms)).toBe(0)
    expect(mindMax({}, [])).toBe(0)
  })
})

describe('frequentTags', () => {
  const e = (createdAt: string, tags: string[]) => ({ ...makeEntry({ tags }), createdAt })
  const tags = DEFAULT_TAGS.map((t) => (t.id === 'mld' ? { ...t, enabled: false } : t))

  it('is every enabled tag in vocabulary order while nothing has been used', () => {
    expect(frequentTags([], tags).map((t) => t.id)).toEqual(tags.filter((t) => t.enabled).map((t) => t.id))
  })

  it('ranks by how often a tag was used, ties in vocabulary order, skipping disabled and unknown ones', () => {
    const entries = [
      e('2026-09-01T00:00:00Z', ['heat', 'stress']),
      e('2026-09-02T00:00:00Z', ['stress', 'period', 'mld']),
      e('2026-09-03T00:00:00Z', ['stress', 'heat', 'gone', 'mld']),
      e('2026-09-04T00:00:00Z', ['rest']),
    ]
    const ids = frequentTags(entries, tags).map((t) => t.id)
    // stress 3, heat 2, then rest and period at 1 in vocabulary order, then the rest of the vocabulary.
    expect(ids.slice(0, 5)).toEqual(['stress', 'heat', 'rest', 'period', 'compression'])
    expect(ids).toHaveLength(tags.length - 1)
    expect(ids).not.toContain('mld')
  })
})

describe('vocabulary edits on unknown or edge items', async () => {
  const { resetDb } = await import('./db')
  const { addTag, rename, move } = await import('./vocab')
  it('ignore unknown ids and out-of-range moves', async () => {
    const db = resetDb()
    await rename('tags', 'nope', 'x')
    await move('tags', 'nope', 1)
    const first = (await db.tags.orderBy('order').toArray())[0]
    await move('tags', first.id, -1)
    expect((await db.tags.orderBy('order').toArray())[0].id).toBe(first.id)
  })
  it('give a new item a random id that says nothing of its name', async () => {
    resetDb()
    const a = await addTag('Ibuprofene', 'medication')
    const b = await addTag('Ibuprofene', 'medication')
    expect(a.id).toMatch(/^[\w-]{21}$/)
    expect(a.id).not.toBe(b.id)
    expect(a.id.toLowerCase()).not.toContain('ibuprofene')
  })
})

describe('labels (§5.2)', async () => {
  const { resetDb } = await import('./db')
  const { addSymptom, addTag, rename } = await import('./vocab')
  it('seed every item with a dictionary key, one per id', () => {
    for (const x of [...DEFAULT_SYMPTOMS, ...DEFAULT_TAGS]) expect(x.label).toBe(`i18n:vocab.${x.id}`)
  })
  it('store what was typed, trimmed, never a dictionary key', async () => {
    const db = resetDb()
    expect((await addSymptom('  Formicolio ')).label).toBe('Formicolio')
    expect((await addTag('i18n:vocab.pain', 'context')).label).toBe('vocab.pain')
    await rename('symptoms', 'swelling', ' i18n: Edema ')
    expect((await db.symptoms.get('swelling'))?.label).toBe('Edema')
    await rename('tags', 'stress', 'Tensione')
    expect((await db.tags.get('stress'))?.label).toBe('Tensione')
  })
  it('leave the item as it was when the name is blank', async () => {
    const db = resetDb()
    await rename('symptoms', 'swelling', '   ')
    await rename('symptoms', 'swelling', 'i18n:')
    expect((await db.symptoms.get('swelling'))?.label).toBe('i18n:vocab.swelling')
  })
})

describe('usage and deletion (§5.2)', async () => {
  const { resetDb } = await import('./db')
  const { addEntry } = await import('./entries')
  const { addPreset } = await import('./presets')
  const { usage, deleteItem, restoreItem, addTag, addSymptom } = await import('./vocab')
  const P = (asks: string[][]) => ({ name: 'P', kind: 'chronic' as const, layers: asks.map((a) => ({ regions: [], asks: a })) })

  it('counts entries reading a symptom or carrying a tag on any layer, and presets asking for a symptom', () => {
    const entries = [
      makeEntry({ layers: [{ regions: ['152'], readings: { pain: 3 }, tags: ['heat'] }, { regions: ['mind'], readings: { fog: 0 }, tags: ['heat'] }] }),
      makeEntry({ layers: [{ regions: [], readings: { pain: 5, swelling: 2 }, tags: [] }] }),
    ]
    // A layer written before asks existed asks for nothing.
    const presets = [{ ...P([['pain'], ['pain', 'fog']]), id: 'p1', order: 0 }, { ...P([['fog']]), id: 'p2', order: 1 }, { id: 'p3', order: 2, name: 'Old', kind: 'chronic' as const, layers: [{ regions: [] }] as never }]
    const u = usage(entries, presets)
    expect(u.get('pain')).toEqual({ entries: 2, presets: 1 })
    expect(u.get('fog')).toEqual({ entries: 1, presets: 2 })
    expect(u.get('swelling')).toEqual({ entries: 1, presets: 0 })
    expect(u.get('heat')).toEqual({ entries: 1, presets: 0 })
    expect(u.get('cold')).toBeUndefined()
  })

  it('deletes an unused item and puts it back as it was', async () => {
    const db = resetDb()
    const t = await addTag('Ibuprofene', 'medication')
    const gone = await deleteItem('tags', t.id)
    expect(gone).toEqual(t)
    expect(await db.tags.get(t.id)).toBeUndefined()
    await restoreItem('tags', gone!)
    expect(await db.tags.get(t.id)).toEqual(t)
    expect(await deleteItem('symptoms', 'stiffness')).toMatchObject({ id: 'stiffness' })
    expect(await db.symptoms.get('stiffness')).toBeUndefined()
  })

  it('lets every item go, and one added to an empty vocabulary starts the order', async () => {
    const db = resetDb()
    for (const t of await db.tags.toArray()) await deleteItem('tags', t.id)
    for (const s of await db.symptoms.toArray()) await deleteItem('symptoms', s.id)
    expect(await db.tags.count()).toBe(0)
    expect(await db.symptoms.count()).toBe(0)
    expect((await addTag('Brufen', 'medication')).order).toBe(0)
    expect((await addSymptom('Formicolio')).order).toBe(0)
  })

  it('lets pain go like any other item while unused', async () => {
    const db = resetDb()
    expect(await deleteItem('symptoms', 'pain')).toMatchObject({ id: 'pain' })
    expect(await db.symptoms.get('pain')).toBeUndefined()
  })

  it('refuses a used item and an unknown one', async () => {
    const db = resetDb()
    await addEntry({ layers: [{ regions: [], readings: { swelling: 0 }, tags: ['heat'] }] })
    await addPreset(P([['fog']]))
    expect(await deleteItem('symptoms', 'swelling')).toBeUndefined()
    expect(await deleteItem('tags', 'heat')).toBeUndefined()
    expect(await deleteItem('symptoms', 'fog')).toBeUndefined()
    expect(await deleteItem('symptoms', 'nope')).toBeUndefined()
    expect(await db.symptoms.get('swelling')).toBeDefined()
    expect(await db.symptoms.get('fog')).toBeDefined()
    expect(await db.tags.get('heat')).toBeDefined()
  })
})
