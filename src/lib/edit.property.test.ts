/**
 * The edit sheet's round trip for any stored entry (#91): opened and saved untouched, what was read stays. Stored entries
 * come from saves, imports and upgrades, so a layer may hold a reading of the other kind (fog on a knee, placed by the
 * 6 → 7 conversion, §8): an edit keeps it.
 */
import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { resetDb } from './db'
import { draftFromEntry, draftToInput } from './draft'
import { updateEntry } from './entries'
import { keptLayers } from './layers'
import { diary } from '../test/arbitraries'
import type { Entry } from './types'
import { runs } from '../test/runs'

// Each run writes to the database: well past the default 5 s under coverage and a loaded machine.
vi.setConfig({ testTimeout: 30_000 })

const stored = diary.filter((f) => f.entries.length > 0).chain((f) => fc.tuple(fc.constant(f), fc.constantFrom(...f.entries)))

/** What EditSheet's Salva writes for a form nobody touched (§6.2). */
async function saveUntouched(e: Entry) {
  const input = draftToInput(draftFromEntry(e))
  await updateEntry(e.id, { at: input.at!, layers: input.layers as Entry['layers'], note: input.note! })
}

describe('the edit sheet, for any stored entry (#91)', () => {
  it('saved untouched, every layer kept keeps its readings and its paint, the same places and tags', async () => {
    await fc.assert(
      fc.asyncProperty(stored, async ([file, entry]) => {
        const db = resetDb()
        await db.symptoms.clear()
        await db.symptoms.bulkPut(file.vocabulary.symptoms)
        await db.entries.put(entry)
        await saveUntouched(entry)
        const after = (await db.entries.get(entry.id))!
        const kept = keptLayers(entry.layers)
        expect(after.layers.map((l) => l.readings)).toEqual(kept.map((l) => l.readings))
        expect(after.layers.map((l) => l.strokes ?? [])).toEqual(kept.map((l) => l.strokes ?? []))
        expect(after.layers.map((l) => new Set(l.regions))).toEqual(kept.map((l) => new Set(l.regions)))
        expect(after.layers.map((l) => new Set(l.tags))).toEqual(kept.map((l) => new Set(l.tags)))
        expect(after.at).toBe(entry.at)
        expect(after.note).toBe(entry.note.trim())
      }),
      { numRuns: runs(100) },
    )
  })

  it('saving untouched twice is saving once', async () => {
    await fc.assert(
      fc.asyncProperty(stored, async ([file, entry]) => {
        const db = resetDb()
        await db.symptoms.clear()
        await db.symptoms.bulkPut(file.vocabulary.symptoms)
        await db.entries.put(entry)
        await saveUntouched(entry)
        const { updatedAt: _a, ...once } = (await db.entries.get(entry.id))!
        await saveUntouched((await db.entries.get(entry.id))!)
        const { updatedAt: _b, ...twice } = (await db.entries.get(entry.id))!
        expect(twice).toStrictEqual(once)
      }),
      { numRuns: runs(100) },
    )
  })
})
