import { describe, it, expect } from 'vitest'
import { toLocalInput, fromLocalInput, dayKey, isSameDay, formatDay, formatDuration, thisMorning, lastNight, hoursAgo } from './time'

describe('time', () => {
  it('round-trips a datetime-local value', () => {
    const iso = new Date(2026, 8, 15, 14, 5).toISOString()
    expect(toLocalInput(iso)).toBe('2026-09-15T14:05')
    expect(fromLocalInput('2026-09-15T14:05')).toBe(iso)
  })

  it('keys and compares days in local time', () => {
    expect(dayKey(new Date(2026, 0, 3, 23, 59).toISOString())).toBe('2026-01-03')
    expect(isSameDay(new Date(2026, 0, 3, 1), new Date(2026, 0, 3, 23))).toBe(true)
    expect(isSameDay(new Date(2026, 0, 3), new Date(2026, 1, 3))).toBe(false)
  })

  it('formats today and yesterday with the given labels and older days by date', () => {
    const labels = { today: 'Oggi', yesterday: 'Ieri' }
    const now = new Date()
    expect(formatDay(now.toISOString(), 'it', labels)).toBe('Oggi')
    const y = new Date(now)
    y.setDate(now.getDate() - 1)
    expect(formatDay(y.toISOString(), 'it', labels)).toBe('Ieri')
    expect(formatDay(new Date(now.getFullYear(), 0, 15, 12).toISOString(), 'en', labels)).toMatch(/Jan/)
    expect(formatDay(new Date(now.getFullYear() - 2, 0, 15, 12).toISOString(), 'en', labels)).toContain(String(now.getFullYear() - 2))
  })

  it('formats durations', () => {
    const u = { d: 'g', h: 'h', m: 'm' }
    expect(formatDuration(45 * 60_000, u)).toBe('45m')
    expect(formatDuration(3 * 3_600_000, u)).toBe('3h')
    expect(formatDuration(51 * 3_600_000, u)).toBe('2g 3h')
    expect(formatDuration(48 * 3_600_000, u)).toBe('2g')
  })

  it('has the quick time choices', () => {
    const now = new Date(2026, 8, 15, 14, 30)
    expect(thisMorning(now).getHours()).toBe(8)
    expect(thisMorning(now).getDate()).toBe(15)
    expect(lastNight(now).getHours()).toBe(22)
    expect(lastNight(now).getDate()).toBe(14)
    expect(hoursAgo(3, now).getTime()).toBe(now.getTime() - 3 * 3_600_000)
  })
})
