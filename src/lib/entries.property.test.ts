/** Episode chains for any diary (#91): grouping, the reading shown, and the undoable changes to a chain. */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { resetDb } from './db'
import { episodesOf, latest, shownReading, endEpisode, reopenEpisode, deleteEntry, restoreEntries, timeProblem, isHead, isUpdate } from './entries'
import { entryHeadline } from './summary'
import { diary, iso } from '../test/arbitraries'
import type { Entry } from './types'

const byId = (rows: Entry[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
/** A diary's entries in any order, as a database or a merge may hand them over. */
const shuffled = diary.chain((f) => fc.shuffledSubarray(f.entries, { minLength: f.entries.length }))
const MIN = 60_000

describe('episode chains, for any diary (#91)', () => {
  it('every update goes under its own head, once, in time order, whatever order the rows come in', () => {
    fc.assert(
      fc.property(shuffled, (entries) => {
        const eps = episodesOf(entries)
        expect([...eps.keys()].sort()).toEqual(entries.filter(isHead).map((e) => e.id).sort())
        for (const u of entries.filter(isUpdate)) {
          const homes = [...eps.values()].filter((ep) => ep.updates.includes(u))
          expect(homes.map((ep) => ep.head.id)).toEqual(eps.has(u.episodeId!) ? [u.episodeId] : [])
        }
        // Time order; at the same time, a split history's point numbers in number order, not as text (#115).
        const n = (e: Entry) => Number(e.id.split(':').at(-1))
        for (const ep of eps.values())
          expect(ep.updates.every((u, i) => i === 0 || ep.updates[i - 1].at < u.at || (ep.updates[i - 1].at === u.at && n(ep.updates[i - 1]) < n(u)))).toBe(true)
        // The same rows in another order give the same episodes.
        expect(episodesOf([...entries].reverse())).toEqual(eps)
      }),
      { numRuns: 300 },
    )
  })

  it('the latest reading is the newest; an ended episode shows its worst, the later of equals', () => {
    fc.assert(
      fc.property(shuffled, (entries) => {
        for (const ep of episodesOf(entries).values()) {
          const all = [ep.head, ...ep.updates]
          expect(all.every((e) => e.at <= latest(ep).at)).toBe(true)
          const shown = shownReading(ep)
          if (!ep.head.endedAt) expect(shown).toBe(latest(ep))
          else {
            const worst = Math.max(...all.map((e) => entryHeadline(e).value))
            expect(entryHeadline(shown).value).toBe(worst)
            expect(all.filter((e) => entryHeadline(e).value === worst && e.at > shown.at)).toEqual([])
          }
        }
      }),
      { numRuns: 300 },
    )
  })

  it('an end, then reopening, gives the episode back as it was', async () => {
    await fc.assert(
      fc.asyncProperty(
        diary.filter((f) => f.entries.some((e) => isHead(e) && !e.endedAt)),
        iso(),
        async (file, at) => {
          const db = resetDb()
          await db.entries.bulkPut(file.entries)
          const head = file.entries.find((e) => isHead(e) && !e.endedAt)!
          await endEpisode(head.id, at)
          expect((await db.entries.get(head.id))?.endedAt).toBe(at)
          await reopenEpisode(head.id)
          const { updatedAt: _a, ...after } = (await db.entries.get(head.id))!
          const { updatedAt: _b, ...before } = head
          expect(after).toEqual(before)
        },
      ),
      { numRuns: 40 },
    )
  })

  it("a delete takes an update alone or a head with its chain, and its undo puts back exactly what went", async () => {
    await fc.assert(
      fc.asyncProperty(
        diary.filter((f) => f.entries.length > 0).chain((f) => fc.tuple(fc.constant(f), fc.constantFrom(...f.entries))),
        async ([file, target]) => {
          const db = resetDb()
          await db.entries.bulkPut(file.entries)
          const gone = await deleteEntry(target.id)
          const want = isHead(target) ? file.entries.filter((e) => e.episodeId === target.id) : [target]
          expect(byId(gone)).toEqual(byId(want))
          expect(byId(await db.entries.toArray())).toEqual(byId(file.entries.filter((e) => !want.includes(e))))
          await restoreEntries(gone)
          expect(byId(await db.entries.toArray())).toEqual(byId(file.entries))
        },
      ),
      { numRuns: 40 },
    )
  })

  it('times are refused exactly when they fall the wrong way round, to the minute', () => {
    fc.assert(
      fc.property(iso(), fc.option(iso(), { nil: null }), fc.option(iso(), { nil: undefined }), fc.option(iso(), { nil: undefined }), (at, endedAt, notBefore, notAfter) => {
        const m = (s: string) => Math.floor(Date.parse(s) / MIN)
        const want = endedAt && m(endedAt) < m(at) ? 'end-before-start' : notBefore && m(at) < m(notBefore) ? 'before-start' : notAfter && m(at) > m(notAfter) ? 'after-update' : null
        expect(timeProblem({ at, endedAt }, { notBefore, notAfter })).toBe(want)
        // The very minute is never a problem.
        expect(timeProblem({ at, endedAt: at }, { notBefore: at, notAfter: at })).toBeNull()
      }),
      { numRuns: 1000 },
    )
  })
})
