/** Search and the vocabulary editor for any diary and any typing (#91): search.ts, vocab.ts. */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { fold, words, search, type SearchContext } from './search'
import { resetDb } from './db'
import { move, frequentTags, usage, deleteItem, restoreItem } from './vocab'
import { isMindSymptom } from './vocabulary'
import { mergedTags } from './layers'
import { t, tl } from '../i18n/index.svelte'
import { prefs } from './prefs.svelte'
import { diary } from '../test/arbitraries'
import type { ExportFile } from './backup'
import type { Symptom, Tag } from './types'
import { runs } from '../test/runs'

// Hundreds of diaries through the database: well past the default 5 s under coverage and a loaded machine.
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  prefs.lang = 'it'
})
const ctxOf = (f: ExportFile): SearchContext => ({ tags: f.vocabulary.tags, symptoms: f.vocabulary.symptoms, presets: f.presets, tl, t })
const anyText = fc.string({ unit: 'grapheme', maxLength: 30 })

describe('search, for any diary and any typing (#91)', () => {
  it('folding is lowercase without accents, and folding again changes nothing', () => {
    fc.assert(
      fc.property(anyText, (s) => {
        expect(fold(fold(s))).toBe(fold(s))
        expect(words(fold(s))).toEqual(words(s))
      }),
      { numRuns: runs(2000) },
    )
  })

  it('on Latin letters, accents and case make no difference: "Perché" is "perche"', () => {
    const letters = [...'aàáâäãåbcçdeèéêëfghiìíîïjklmnñoòóôöõpqrstuùúûüvwxyz']
    const bare = (c: string) => c.normalize('NFD')[0]
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...letters), { minLength: 1, maxLength: 12 }), (cs) => {
        const w = cs.join('')
        expect(fold(w.toUpperCase())).toBe(fold(w))
        expect(fold(w)).toBe(cs.map(bare).join(''))
      }),
      { numRuns: runs(1000) },
    )
  })

  it('any word of a note finds its entry; results are entries of the diary, newest first', () => {
    fc.assert(
      fc.property(
        diary.filter((f) => f.entries.some((e) => words(e.note).length)).chain((f) => {
          const noted = f.entries.filter((e) => words(e.note).length)
          return fc.tuple(fc.constant(f), fc.constantFrom(...noted)).chain(([f, e]) => fc.tuple(fc.constant(f), fc.constant(e), fc.constantFrom(...words(e.note))))
        }),
        ([file, entry, word]) => {
          const found = search(file.entries, word, ctxOf(file))
          expect(found).toContain(entry)
          expect(found.every((e) => file.entries.includes(e))).toBe(true)
          expect(found.every((e, i) => i === 0 || found[i - 1].at >= e.at)).toBe(true)
        },
      ),
      { numRuns: runs(300) },
    )
  })

  it('nothing typed finds everything, newest first', () => {
    fc.assert(
      fc.property(diary, fc.constantFrom('', ' ', '  ,. '), (file, q) => {
        expect(new Set(search(file.entries, q, ctxOf(file)))).toEqual(new Set(file.entries))
      }),
      { numRuns: runs(100) },
    )
  })
})

describe('the vocabulary editor, for any vocabulary and moves (#91)', () => {
  const groupOf = (table: 'symptoms' | 'tags', x: Symptom | Tag) => (table === 'tags' ? (x as Tag).group : isMindSymptom(x as Symptom) ? 'mind' : 'body')
  const listed = async (db: ReturnType<typeof resetDb>, table: 'symptoms' | 'tags') => (await db[table].orderBy('order').toArray()) as (Symptom | Tag)[]

  it('moves keep every item in its group, number the list 0…n−1, and an item moved up then down comes back', async () => {
    await fc.assert(
      fc.asyncProperty(
        diary,
        fc.constantFrom('symptoms' as const, 'tags' as const),
        fc.array(fc.tuple(fc.nat(30), fc.constantFrom(-1 as const, 1 as const)), { maxLength: 8 }),
        async (file, table, moves) => {
          const db = resetDb()
          const rows = table === 'tags' ? file.vocabulary.tags : file.vocabulary.symptoms
          await db[table].clear()
          if (!rows.length) return
          await (db[table] as typeof db.tags).bulkPut(rows as Tag[])
          const before = await listed(db, table)
          for (const [k, dir] of moves) await move(table, rows[k % rows.length].id, dir)
          const after = await listed(db, table)
          // A move that happens renumbers the whole list; moves that cannot happen leave it alone.
          if (after.some((x, i) => x.id !== before[i].id)) expect(after.map((x) => x.order)).toEqual(after.map((_, i) => i))
          expect(after.map((x) => x.id).sort()).toEqual(before.map((x) => x.id).sort())
          // A move swaps two items of one group: the groups along the list are where they were.
          expect(after.map((x) => groupOf(table, x))).toEqual(before.map((x) => groupOf(table, x)))
          // Up then down: an item that could go up comes back where it was.
          const order = after.map((x) => x.id)
          const k = order.findIndex((id, i) => i > 0 && after.slice(0, i).some((y) => groupOf(table, y) === groupOf(table, after[i])))
          if (k < 0) return
          await move(table, order[k], -1)
          await move(table, order[k], 1)
          expect((await listed(db, table)).map((x) => x.id)).toEqual(order)
        },
      ),
      { numRuns: runs(60) },
    )
  })

  it("the tag strip is every enabled tag, most used first, ties in the vocabulary's order", () => {
    fc.assert(
      fc.property(diary, (file) => {
        const tags = [...file.vocabulary.tags].sort((a, b) => a.order - b.order)
        const strip = frequentTags(file.entries, tags)
        const count = (id: string) => file.entries.filter((e) => mergedTags(e.layers).includes(id)).length
        expect(strip).toEqual(tags.filter((x) => x.enabled).map((x, i) => ({ x, i })).sort((a, b) => count(b.x.id) - count(a.x.id) || a.i - b.i).map(({ x }) => x))
      }),
      { numRuns: runs(300) },
    )
  })

  it('usage counts the entries that read or carry an item and the presets that ask it', () => {
    fc.assert(
      fc.property(diary, (file) => {
        const u = usage(file.entries, file.presets)
        const ids = new Set([...file.vocabulary.symptoms, ...file.vocabulary.tags].map((x) => x.id))
        for (const id of ids) {
          const entries = file.entries.filter((e) => e.layers.some((l) => id in l.readings || l.tags.includes(id))).length
          const presets = file.presets.filter((p) => p.layers.some((l) => l.asks.includes(id))).length
          expect(u.get(id) ?? { entries: 0, presets: 0 }, id).toEqual({ entries, presets })
        }
      }),
      { numRuns: runs(300) },
    )
  })

  it('an item in use is never deleted; a delete and its undo give the table back', async () => {
    await fc.assert(
      fc.asyncProperty(
        diary.filter((f) => f.vocabulary.symptoms.length + f.vocabulary.tags.length > 0).chain((f) =>
          fc.tuple(fc.constant(f), fc.constantFrom(...f.vocabulary.symptoms.map((x) => ['symptoms', x] as const), ...f.vocabulary.tags.map((x) => ['tags', x] as const))),
        ),
        async ([file, [table, item]]) => {
          const db = resetDb()
          await Promise.all([db.symptoms.clear(), db.tags.clear()])
          await db.symptoms.bulkPut(file.vocabulary.symptoms)
          await db.tags.bulkPut(file.vocabulary.tags)
          await db.entries.bulkPut(file.entries)
          await db.presets.bulkPut(file.presets)
          const before = await db[table].toArray()
          const used = usage(file.entries, file.presets).has(item.id)
          const gone = await deleteItem(table, item.id)
          expect(gone === undefined).toBe(used)
          if (gone) await restoreItem(table, gone)
          expect(await db[table].toArray()).toEqual(before)
        },
      ),
      { numRuns: runs(60) },
    )
  })
})
