import { describe, it, expect } from 'vitest'
import { frequentTags } from './vocab'
import { makeEntry } from './entries'
import { DEFAULT_TAGS } from './vocabulary'

describe('frequentTags', () => {
  const e = (createdAt: string, tags: string[]) => ({ ...makeEntry({ tags }), createdAt })

  it('falls back to the first enabled tags in vocabulary order', () => {
    const tags = DEFAULT_TAGS.map((t) => (t.id === 'mld' ? { ...t, enabled: false } : t))
    expect(frequentTags([], tags, 4).map((t) => t.id)).toEqual(['compression', 'exercise', 'rest', 'heat'])
  })

  it('ranks by how often a tag was used, ties in vocabulary order, skipping disabled and unknown ones', () => {
    const entries = [
      e('2026-09-01T00:00:00Z', ['heat', 'stress']),
      e('2026-09-02T00:00:00Z', ['stress', 'period', 'mld']),
      e('2026-09-03T00:00:00Z', ['stress', 'heat', 'gone', 'mld']),
      e('2026-09-04T00:00:00Z', ['rest']),
    ]
    const tags = DEFAULT_TAGS.map((t) => (t.id === 'mld' ? { ...t, enabled: false } : t))
    // stress 3, heat 2, then rest and period at 1 in vocabulary order, then the fill.
    expect(frequentTags(entries, tags, 5).map((t) => t.id)).toEqual(['stress', 'heat', 'rest', 'period', 'compression'])
  })

  it('appends selected tags that would otherwise be out of the strip, without reordering it', () => {
    const tags = DEFAULT_TAGS.map((t) => (t.id === 'mld' ? { ...t, enabled: false } : t))
    expect(frequentTags([], tags, 3, ['heat', 'compression', 'mld', 'gone']).map((t) => t.id)).toEqual(['compression', 'exercise', 'rest', 'heat'])
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
