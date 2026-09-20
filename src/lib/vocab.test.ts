import { describe, it, expect } from 'vitest'
import { frequentTags } from './vocab'
import { makeEntry } from './entries'
import { DEFAULT_TAGS, DEFAULT_SYMPTOMS, defaultCategory, isMindSymptom, mindMax } from './vocabulary'

describe('symptom categories', () => {
  it('fog is a mind symptom by default, the rest body; a row without a category reads as its default', () => {
    expect(defaultCategory('fog')).toBe('mind')
    expect(defaultCategory('pain')).toBe('body')
    expect(DEFAULT_SYMPTOMS.filter(isMindSymptom).map((s) => s.id)).toEqual(['fog', 'anxiety', 'depression'])
    expect(isMindSymptom({ ...DEFAULT_SYMPTOMS[4], category: undefined as never })).toBe(true)
    expect(isMindSymptom({ ...DEFAULT_SYMPTOMS[1], category: 'mind' })).toBe(true)
  })
  it('mindMax is the highest mental reading, 0 when none', () => {
    const symptoms = [...DEFAULT_SYMPTOMS, { id: 'irritability', label: { it: 'Irritabilità', en: 'Irritabilità' }, category: 'mind' as const, enabled: false, order: 9 }]
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
  it('ignore unknown ids and out-of-range moves, and slug symbol-only names', async () => {
    const db = resetDb()
    await rename('tags', 'nope', 'it', 'x')
    await move('tags', 'nope', 1)
    const first = (await db.tags.orderBy('order').toArray())[0]
    await move('tags', first.id, -1)
    expect((await db.tags.orderBy('order').toArray())[0].id).toBe(first.id)
    const t = await addTag('!!!', 'medication')
    expect(t.id).toMatch(/^item_/)
  })
})
