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
