/**
 * Trends' figures for any diary (#91), each against a count done the plain way, in Rome's time zone so ranges cross
 * the clock changes. The diaries are squeezed into a fortnight, so days hold several readings and ranges catch them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import { rangeStart, rangeEnd, dailySeries, summarize, tagCounts, presetSeries } from './stats'
import { dayKey } from './time'
import { mergedReadings, mergedTags } from './layers'
import { leadSymptom } from './vocabulary'
import { diary } from '../test/arbitraries'
import type { Entry } from './types'

let zone: string | undefined
beforeAll(() => {
  zone = process.env.TZ
  process.env.TZ = 'Europe/Rome'
})
afterAll(() => {
  if (zone === undefined) delete process.env.TZ
  else process.env.TZ = zone
})

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Fortnights that hold a clock change, and one that does not. */
const STARTS = [Date.UTC(2026, 2, 22), Date.UTC(2026, 9, 18), Date.UTC(2026, 5, 1)]
/** A diary whose times all fall in one fortnight, kept in their order; and a moment in it, to count back from. */
const squeezed = fc
  .tuple(diary, fc.constantFrom(...STARTS), fc.integer({ min: 0, max: 14 * DAY }))
  .map(([file, start, offset]) => {
    const fit = (iso: string) => new Date(start + (Date.parse(iso) % (14 * DAY))).toISOString()
    const entries = file.entries.map((e) => ({ ...e, at: fit(e.at), ...(e.endedAt ? { endedAt: fit(e.endedAt) } : {}) }))
    return { file, entries, now: start + offset }
  })
const symptomOf = (file: { vocabulary: { symptoms: { id: string }[] } }) => fc.constantFrom('pain', ...file.vocabulary.symptoms.map((s) => s.id))

/** The plain way: an entry's level for a symptom is the highest across its layers, absent when no layer reads it. */
const levelOf = (e: Entry, s: string): number | undefined => mergedReadings(e.layers)[s]
const groupByDay = <T,>(xs: T[], at: (x: T) => string) => {
  const out: Record<string, T[]> = {}
  for (const x of xs) (out[dayKey(at(x))] ??= []).push(x)
  return out
}
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const middle = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

describe('Trends figures, for any diary (#91)', () => {
  it('a range of n days runs from midnight n − 1 days back to the last moment of today', () => {
    fc.assert(
      fc.property(fc.constantFrom(...STARTS), fc.integer({ min: 0, max: 30 * DAY }), fc.integer({ min: 1, max: 120 }), (start, offset, n) => {
        const now = new Date(start + offset)
        const from = rangeStart(n, now)
        const to = rangeEnd(from, n)
        expect([from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds()]).toEqual([0, 0, 0, 0])
        expect([to.getHours(), to.getMinutes(), to.getSeconds(), to.getMilliseconds()]).toEqual([23, 59, 59, 999])
        expect(dayKey(to.toISOString())).toBe(dayKey(now.toISOString()))
        const back = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1))
        expect(from.getTime()).toBe(back.getTime())
      }),
      { numRuns: 500 },
    )
  })

  it('the daily chart has one point per calendar day, each the plain count, max and mean of that day', () => {
    fc.assert(
      fc.property(
        squeezed.chain((d) => fc.tuple(fc.constant(d), symptomOf(d.file), fc.integer({ min: 1, max: 21 }))),
        ([{ entries, now }, s, n]) => {
          const from = rangeStart(n, new Date(now))
          const points = dailySeries(entries, from, n, s)
          expect(points).toHaveLength(n)
          for (let i = 0; i < n; i++) expect(points[i].day).toBe(dayKey(new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12).toISOString()))
          const days = groupByDay(entries.filter((e) => levelOf(e, s) !== undefined), (e) => e.at)
          for (const p of points) {
            const vs = (days[p.day] ?? []).map((e) => levelOf(e, s)!)
            expect({ count: p.count, max: p.max, mean: p.mean }).toEqual({ count: vs.length, max: vs.length ? Math.max(...vs) : null, mean: vs.length ? avg(vs) : null })
          }
          const to = rangeEnd(from, n)
          const inRange = entries.filter((e) => levelOf(e, s) !== undefined && Date.parse(e.at) >= from.getTime() && Date.parse(e.at) <= to.getTime())
          expect(points.reduce((t, p) => t + p.count, 0)).toBe(inRange.length)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('the tiles and the worst-day bars are the plain counts', () => {
    fc.assert(
      fc.property(
        squeezed.chain((d) => fc.tuple(fc.constant(d), symptomOf(d.file))),
        ([{ entries, now }, s]) => {
          const got = summarize(entries, s, now)
          const read = entries.filter((e) => levelOf(e, s) !== undefined)
          const days = Object.values(groupByDay(read, (e) => e.at))
          const worst = days.map((es) => Math.max(...es.map((e) => levelOf(e, s)!)))
          const heads = entries.filter((e) => e.episodeId === e.id)
          const ended = heads.filter((e) => e.endedAt).map((e) => Math.max(0, Date.parse(e.endedAt!) - Date.parse(e.at)))
          expect(got).toEqual({
            entries: entries.length,
            daysWithEntries: new Set(entries.map((e) => dayKey(e.at))).size,
            mean: days.length ? avg(days.map((es) => avg(es.map((e) => levelOf(e, s)!)))) : null,
            max: read.length ? Math.max(...read.map((e) => levelOf(e, s)!)) : null,
            worst: Array.from({ length: 11 }, (_, level) => worst.filter((w) => w === level).length),
            median: worst.length ? middle(worst) : null,
            episodes: heads.length,
            medianEpisodeMs: ended.length ? middle(ended) : null,
            ongoing: heads.filter((e) => !e.endedAt).length,
          })
        },
      ),
      { numRuns: 300 },
    )
  })

  it('a tag counts the days it was used on, and only tags used appear', () => {
    fc.assert(
      fc.property(squeezed, ({ file, entries }) => {
        const got = tagCounts(entries, file.vocabulary.tags)
        for (const tag of file.vocabulary.tags) {
          const days = new Set(entries.filter((e) => mergedTags(e.layers).includes(tag.id)).map((e) => dayKey(e.at))).size
          expect(got.find((x) => x.tag.id === tag.id)?.days ?? 0, tag.id).toBe(days)
        }
        expect(got.every((x) => x.days > 0)).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  it("a preset's line holds every reading logged from it, an episode's updates included, in time order", () => {
    fc.assert(
      fc.property(squeezed, ({ file, entries }) => {
        const heads = new Map(entries.filter((e) => e.episodeId === e.id).map((e) => [e.id, e]))
        const presetOf = (e: Entry) => e.presetId ?? (e.episodeId ? heads.get(e.episodeId)?.presetId : undefined)
        const lead = leadSymptom(file.vocabulary.symptoms)
        const series = presetSeries(entries, file.presets, [], file.vocabulary.symptoms)
        for (const preset of file.presets) {
          // §6.3: the lead symptom when a layer asks for it, else the first thing the first layer asks.
          const id = lead && preset.layers.some((l) => l.asks.includes(lead)) ? lead : (preset.layers[0]?.asks[0] ?? lead)
          const want = entries
            .filter((e) => presetOf(e) === preset.id && id !== undefined && levelOf(e, id) !== undefined)
            .map((e) => ({ at: Date.parse(e.at), value: levelOf(e, id!)! }))
            .sort((a, b) => a.at - b.at)
          const got = series.find((r) => r.preset.id === preset.id)?.points ?? []
          expect(got.map((p) => p.at)).toEqual(want.map((p) => p.at))
          expect([...got].sort((a, b) => a.at - b.at || a.value - b.value)).toEqual([...want].sort((a, b) => a.at - b.at || a.value - b.value))
        }
      }),
      { numRuns: 300 },
    )
  })
})
