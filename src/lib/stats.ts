import { PAIN, type Entry, type Preset, type Symptom, type Tag } from './types'
import { REGIONS, FULL_BODY } from './regions'
import { durationMs } from './entries'
import { mergedReadings, mergedTags } from './layers'
import { dayKey } from './time'

const ALL_IDS = [...new Set(REGIONS.map((r) => r.id))]
const readings = (e: Entry) => mergedReadings(e.layers)
const pain = (e: Entry) => readings(e)[PAIN] ?? 0

export function rangeStart(days: number, now = new Date()): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (days - 1))
  return d
}

export function inRange(entries: Entry[], from: Date, to: Date = new Date(8.64e15)): Entry[] {
  const a = from.getTime()
  const b = to.getTime()
  return entries.filter((e) => {
    const t = Date.parse(e.at)
    return t >= a && t < b
  })
}

export type DayPoint = { day: string; date: Date; max: number | null; mean: number | null; count: number }

/** One point per calendar day in [from, from + days). Days without entries have null values. */
export function dailySeries(entries: Entry[], from: Date, days: number): DayPoint[] {
  const byDay = new Map<string, number[]>()
  for (const e of entries) {
    const k = dayKey(e.at)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(pain(e))
  }
  const out: DayPoint[] = []
  for (let i = 0; i < days; i++) {
    const date = new Date(from)
    date.setDate(from.getDate() + i)
    const k = dayKey(date.toISOString())
    const v = byDay.get(k)
    out.push({
      day: k,
      date,
      max: v ? Math.max(...v) : null,
      mean: v ? v.reduce((a, b) => a + b, 0) / v.length : null,
      count: v?.length ?? 0,
    })
  }
  return out
}

export type Summary = {
  entries: number
  daysWithEntries: number
  meanPain: number | null
  maxPain: number | null
  daysAtLeast5: number
  episodes: number
  meanEpisodeMs: number | null
  maxEpisodeMs: number | null
  hoursPerWeek: number | null
}

export function summarize(entries: Entry[], days: number, now = Date.now()): Summary {
  const series = new Set(entries.map((e) => dayKey(e.at)))
  const pains = entries.map(pain)
  const dayMax = new Map<string, number>()
  for (const e of entries) dayMax.set(dayKey(e.at), Math.max(dayMax.get(dayKey(e.at)) ?? 0, pain(e)))
  const eps = entries.map((e) => durationMs(e, now)).filter((d): d is number => d !== null)
  const total = eps.reduce((a, b) => a + b, 0)
  return {
    entries: entries.length,
    daysWithEntries: series.size,
    meanPain: pains.length ? pains.reduce((a, b) => a + b, 0) / pains.length : null,
    maxPain: pains.length ? Math.max(...pains) : null,
    daysAtLeast5: [...dayMax.values()].filter((v) => v >= 5).length,
    episodes: eps.length,
    meanEpisodeMs: eps.length ? total / eps.length : null,
    maxEpisodeMs: eps.length ? Math.max(...eps) : null,
    hoursPerWeek: eps.length ? total / 3_600_000 / (days / 7) : null,
  }
}

export type Heat = { mean: number; count: number; weight: number }

/**
 * Per-region mean level of one symptom and how often it appeared, weight = count / max count (§6.3). An entry
 * counts once per region, at the max over its layers that carry the symptom; layers without it contribute
 * nothing. Full body counts for every body region; the mind is one more region.
 */
export function regionHeat(entries: Entry[], symptom = PAIN): Map<string, Heat> {
  const acc = new Map<string, { sum: number; count: number }>()
  for (const e of entries) {
    const best = new Map<string, number>()
    for (const l of e.layers) {
      const v = l.readings[symptom]
      if (typeof v !== 'number') continue
      const ids = l.regions.includes(FULL_BODY) ? [...ALL_IDS, ...l.regions.filter((r) => r !== FULL_BODY)] : l.regions
      for (const id of ids) best.set(id, Math.max(best.get(id) ?? 0, v))
    }
    for (const [id, v] of best) {
      const c = acc.get(id) ?? { sum: 0, count: 0 }
      c.sum += v
      c.count++
      acc.set(id, c)
    }
  }
  const maxCount = Math.max(1, ...[...acc.values()].map((c) => c.count))
  return new Map([...acc].map(([id, c]) => [id, { mean: c.sum / c.count, count: c.count, weight: c.count / maxCount }]))
}

export type TagComparison = { tag: Tag; withN: number; withoutN: number; withMean: number; withoutMean: number }

export const MIN_DAYS_PER_SIDE = 5

/** Mean daily max pain on days with vs without each tag. Only tags with enough days on both sides. */
export function tagComparison(entries: Entry[], tags: Tag[], minDays = MIN_DAYS_PER_SIDE): TagComparison[] {
  const days = new Map<string, { max: number; tags: Set<string> }>()
  for (const e of entries) {
    const k = dayKey(e.at)
    const d = days.get(k) ?? { max: 0, tags: new Set<string>() }
    d.max = Math.max(d.max, pain(e))
    mergedTags(e.layers).forEach((t) => d.tags.add(t))
    days.set(k, d)
  }
  const all = [...days.values()]
  const out: TagComparison[] = []
  for (const tag of tags) {
    const w = all.filter((d) => d.tags.has(tag.id))
    const wo = all.filter((d) => !d.tags.has(tag.id))
    if (w.length < minDays || wo.length < minDays) continue
    const mean = (xs: { max: number }[]) => xs.reduce((a, b) => a + b.max, 0) / xs.length
    out.push({ tag, withN: w.length, withoutN: wo.length, withMean: mean(w), withoutMean: mean(wo) })
  }
  return out.sort((a, b) => Math.abs(b.withMean - b.withoutMean) - Math.abs(a.withMean - a.withoutMean))
}

export type SymptomMean = { symptom: Symptom; mean: number; count: number }

/** Mean of each non-pain symptom over the entries where it was recorded above zero. */
export function symptomMeans(entries: Entry[], symptoms: Symptom[]): SymptomMean[] {
  return symptoms
    .filter((s) => s.id !== PAIN)
    .map((symptom) => {
      const vals = entries.map((e) => readings(e)[symptom.id]).filter((v): v is number => typeof v === 'number' && v > 0)
      return { symptom, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, count: vals.length }
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.mean - a.mean)
}

/** Tag usage counts in the range. */
export function tagCounts(entries: Entry[], tags: Tag[]): { tag: Tag; count: number }[] {
  const c = new Map<string, number>()
  for (const e of entries) for (const t of mergedTags(e.layers)) c.set(t, (c.get(t) ?? 0) + 1)
  return tags
    .map((tag) => ({ tag, count: c.get(tag.id) ?? 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
}

export type PresetPoint = { at: number; value: number }

/** One line per preset that has samples: the preset's first symptom over time, samples only, no carry-forward. */
export function presetSeries(entries: Entry[], presets: Preset[]): { preset: Preset; points: PresetPoint[] }[] {
  return presets
    .map((preset) => {
      const id = preset.symptomIds[0] ?? PAIN
      const points = entries
        .filter((e) => e.preset === preset.id)
        .map((e) => ({ at: Date.parse(e.at), value: readings(e)[id] ?? 0 }))
        .sort((a, b) => a.at - b.at)
      return { preset, points }
    })
    .filter((r) => r.points.length > 0)
}
