/**
 * The time helpers for any instant (#91), in Italy's time zone (Europe/Rome): the hour that repeats in October
 * and the one that never happens in March are where local times go wrong. The rest of the suite runs in whatever zone
 * the machine has (UTC in the Nix sandbox), so it never crosses one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fc from 'fast-check'
import { toLocalInput, fromLocalInput, dayKey, isSameDay, formatDuration, thisMorning, lastNight, hoursAgo } from './time'
import { runs } from '../test/runs'

let zone: string | undefined
beforeAll(() => {
  zone = process.env.TZ
  process.env.TZ = 'Europe/Rome'
})
afterAll(() => {
  if (zone === undefined) delete process.env.TZ
  else process.env.TZ = zone
})

const MIN = 60_000
const HOUR = 60 * MIN
/** Any instant from 2020 to 2030, with extra weight on the nights the clocks change. */
const changes = [Date.UTC(2025, 2, 30, 1), Date.UTC(2025, 9, 26, 1), Date.UTC(2026, 2, 29, 1), Date.UTC(2026, 9, 25, 1)]
const near = (span: number) => fc.tuple(fc.constantFrom(...changes), fc.integer({ min: -span, max: span })).map(([c, d]) => c + d)
/** A wall-clock time in Rome, any minute of the two days either side of a change: midnight is where days go wrong. */
const days = [[2025, 2, 30], [2025, 9, 26], [2026, 2, 29], [2026, 9, 25]] as const
const wall = fc
  .tuple(fc.constantFrom(...days), fc.integer({ min: -2, max: 2 }), fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([[y, m, d], shift, h, mi]) => new Date(y, m, d + shift, h, mi).getTime())
const instant = fc.oneof(fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2030, 0, 1) }), near(3 * HOUR), wall)
/** Two instants up to a day and a half apart: where a calendar day can begin between them. */
const pair = fc.tuple(instant, fc.integer({ min: -36 * HOUR, max: 36 * HOUR })).map(([a, d]) => [a, a + d] as const)
const units = { d: 'g', h: 'h', m: 'm' }

describe('time helpers, for any instant (#91)', () => {
  it('runs in Rome: the clocks change in it', () => {
    expect(new Date(Date.UTC(2026, 0, 1)).getTimezoneOffset()).toBe(-60)
    expect(new Date(Date.UTC(2026, 6, 1)).getTimezoneOffset()).toBe(-120)
  })

  it('a datetime-local value read back is the same instant, to the minute, but in the hour that repeats', () => {
    fc.assert(
      fc.property(instant, (t) => {
        const minute = Math.floor(t / MIN) * MIN
        const back = Date.parse(fromLocalInput(toLocalInput(new Date(t).toISOString()))!)
        // A datetime-local value has no offset: the second 02:30 of October's last Sunday reads back as the first.
        const repeated = new Date(t).getTimezoneOffset() === -60 && new Date(t - HOUR).getTimezoneOffset() === -120
        expect(back).toBe(repeated ? minute - HOUR : minute)
      }),
      { numRuns: runs(1000) },
    )
  })

  it('the hour that repeats reads back as its first time (#91)', () => {
    // 01:30Z on 26 October 2025 is the second 02:30 in Rome, after the clocks went back.
    expect(toLocalInput('2025-10-26T01:30:00.000Z')).toBe('2025-10-26T02:30')
    expect(fromLocalInput('2025-10-26T02:30')).toBe('2025-10-26T00:30:00.000Z')
  })

  it('two instants share a day key exactly when they share a calendar day', () => {
    fc.assert(
      fc.property(pair, ([a, b]) => {
        expect(dayKey(new Date(a).toISOString()) === dayKey(new Date(b).toISOString())).toBe(isSameDay(new Date(a), new Date(b)))
      }),
      { numRuns: runs(1000) },
    )
  })

  it('Stamattina is 08:00 of the same day, Ieri sera 22:00 of the day before, both before now once offered', () => {
    fc.assert(
      fc.property(instant, (t) => {
        const now = new Date(t)
        const morning = thisMorning(now)
        expect(isSameDay(morning, now)).toBe(true)
        expect([morning.getHours(), morning.getMinutes()]).toEqual([8, 0])
        // The chip is offered from 08:00 only (§6.1).
        if (now.getHours() >= 8) expect(morning.getTime()).toBeLessThanOrEqual(t)
        const night = lastNight(now)
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12)
        expect(isSameDay(night, yesterday)).toBe(true)
        expect([night.getHours(), night.getMinutes()]).toEqual([22, 0])
        expect(night.getTime()).toBeLessThan(t)
      }),
      { numRuns: runs(1000) },
    )
  })

  it('n hours ago is never after now, and exactly n hours of real time back', () => {
    fc.assert(
      fc.property(instant, fc.integer({ min: 0, max: 72 }), (t, n) => {
        const back = hoursAgo(n, new Date(t))
        expect(t - back.getTime()).toBe(n * HOUR)
      }),
      { numRuns: runs(1000) },
    )
  })

  it('a duration prints as minutes, hours, or days and hours: never negative, never NaN', () => {
    fc.assert(
      fc.property(fc.integer({ min: -30 * 86_400_000, max: 400 * 86_400_000 }), (ms) => {
        expect(formatDuration(ms, units)).toMatch(/^(\d+m|\d+h|\d+g( \d+h)?)$/)
      }),
      { numRuns: runs(1000) },
    )
  })
})
