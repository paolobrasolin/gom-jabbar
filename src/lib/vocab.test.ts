import { describe, it, expect } from 'vitest'
import { recentTags } from './vocab'
import { makeEntry } from './entries'
import { DEFAULT_TAGS } from './vocabulary'

describe('recentTags', () => {
  it('falls back to the first enabled tags in vocabulary order', () => {
    const tags = DEFAULT_TAGS.map((t) => (t.id === 'mld' ? { ...t, enabled: false } : t))
    expect(recentTags([], tags, 4).map((t) => t.id)).toEqual(['compression', 'exercise', 'rest', 'heat'])
  })

  it('puts the most recently used tags first, skipping disabled and unknown ones', () => {
    const e = (createdAt: string, tags: string[]) => ({ ...makeEntry({ tags }), createdAt })
    const entries = [e('2026-09-01T00:00:00Z', ['heat', 'stress']), e('2026-09-03T00:00:00Z', ['rest', 'gone', 'mld']), e('2026-09-02T00:00:00Z', ['period'])]
    const tags = DEFAULT_TAGS.map((t) => (t.id === 'mld' ? { ...t, enabled: false } : t))
    expect(recentTags(entries, tags, 5).map((t) => t.id)).toEqual(['rest', 'period', 'heat', 'stress', 'compression'])
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
