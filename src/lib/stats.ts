import { PAIN, type Entry, type Preset, type Symptom, type Tag } from './types'
import { REGIONS, FULL_BODY } from './regions'
import { durationMs, isHead } from './entries'
import { presetOf } from './presets'
import { mergedReadings, mergedTags } from './layers'
import { dayKey } from './time'
import { leadSymptom } from './vocabulary'

const ALL_IDS = [...new Set(REGIONS.map((r) => r.id))]
const readings = (e: Entry) => mergedReadings(e.layers)
/**
 * The figures of Trends and the report read one symptom (§6.3, #38): pain unless another is picked. An entry counts only
 * when it reads that symptom: one without the reading is not a 0 (#36), it sits out the figures.
 */
const level = (e: Entry, symptom: string): number | undefined => readings(e)[symptom]
const withLevel = (entries: Entry[], symptom: string) => entries.flatMap((e) => (level(e, symptom) === undefined ? [] : [{ e, v: level(e, symptom)! }]))

export function rangeStart(days: number, now = new Date()): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (days - 1))
  return d
}

/**
 * The last moment of a range's last calendar day, counted in days, not in 24-hour steps: the spring clock change makes
 * one day 23 hours long, and `from` plus 30 × 24 h would land on the day after.
 */
export function rangeEnd(from: Date, days: number): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + days - 1)
  d.setHours(23, 59, 59, 999)
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

/** One point per calendar day in [from, from + days), over the entries reading the symptom. Days without any have null values. */
export function dailySeries(entries: Entry[], from: Date, days: number, symptom = PAIN): DayPoint[] {
  const byDay = new Map<string, number[]>()
  for (const { e, v } of withLevel(entries, symptom)) {
    const k = dayKey(e.at)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(v)
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

/**
 * The mean of `vals` per day, then across days (§6.3): a day logged twenty times (a migraine and its updates) weighs as
 * much as a day logged once, so the figure is the typical day, not the typical entry.
 */
function dailyMean(vals: { at: string; v: number }[]): { mean: number; days: number } | null {
  const byDay = new Map<string, number[]>()
  for (const { at, v } of vals) byDay.set(dayKey(at), [...(byDay.get(dayKey(at)) ?? []), v])
  if (!byDay.size) return null
  const means = [...byDay.values()].map((vs) => vs.reduce((a, b) => a + b, 0) / vs.length)
  return { mean: means.reduce((a, b) => a + b, 0) / means.length, days: means.length }
}

export type Summary = {
  entries: number
  daysWithEntries: number
  /** The symptom's mean per day, then across days, and its max, over the entries reading it; null when none does. */
  mean: number | null
  max: number | null
  daysAtLeast5: number
  episodes: number
  /**
   * The median length of the episodes that have ended; null when none has (§6.3). An episode still going on is not a
   * length yet: counted in `ongoing`, never at its time so far, so a forgotten Termina cannot inflate it.
   */
  medianEpisodeMs: number | null
  ongoing: number
}

export function summarize(entries: Entry[], days: number, symptom = PAIN, now = Date.now()): Summary {
  const series = new Set(entries.map((e) => dayKey(e.at)))
  const read = withLevel(entries, symptom)
  const vs = read.map((r) => r.v)
  const dayMax = new Map<string, number>()
  for (const { e, v } of read) dayMax.set(dayKey(e.at), Math.max(dayMax.get(dayKey(e.at)) ?? 0, v))
  const heads = entries.filter(isHead)
  const ended = heads.filter((e) => e.endedAt).map((e) => durationMs(e, now)!).sort((a, b) => a - b)
  const mid = ended.length >> 1
  return {
    entries: entries.length,
    daysWithEntries: series.size,
    mean: dailyMean(read.map(({ e, v }) => ({ at: e.at, v })))?.mean ?? null,
    max: vs.length ? Math.max(...vs) : null,
    daysAtLeast5: [...dayMax.values()].filter((v) => v >= 5).length,
    episodes: heads.length,
    medianEpisodeMs: ended.length ? (ended.length % 2 ? ended[mid] : (ended[mid - 1] + ended[mid]) / 2) : null,
    ongoing: heads.length - ended.length,
  }
}

export type Heat = { mean: number; count: number; weight: number }

/**
 * Per-region mean level of one symptom and how often it appeared, weight = ln(1 + count) / ln(1 + max count) (§6.3):
 * frequency is read in ratios, once against twice more than 18 against 20, and a diary's counts have a long tail. An entry
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
  const scale = Math.log(1 + maxCount)
  return new Map([...acc].map(([id, c]) => [id, { mean: c.sum / c.count, count: c.count, weight: Math.log(1 + c.count) / scale }]))
}

/** The heatmap's frequency ring (§6.3), in screen px inside the region: a hairline for once, 2.5px for the most frequent. */
export const ringWidth = (weight: number) => 0.75 + 1.75 * weight
/** The ring as drawn: twice the width, clipped to the region, so only the inner half shows. */
export const ringStyle = (weight: number) => `stroke-width:${(2 * ringWidth(weight)).toFixed(2)}px`

export type TagComparison = { tag: Tag; withN: number; withoutN: number; withMean: number; withoutMean: number }

export const MIN_DAYS_PER_SIDE = 5

/** Mean daily max of the symptom on days with vs without each tag, over the days reading it. Only tags with enough days on both sides. */
export function tagComparison(entries: Entry[], tags: Tag[], symptom = PAIN, minDays = MIN_DAYS_PER_SIDE): TagComparison[] {
  const days = new Map<string, { max: number | undefined; tags: Set<string> }>()
  for (const e of entries) {
    const k = dayKey(e.at)
    const d = days.get(k) ?? { max: undefined, tags: new Set<string>() }
    const v = level(e, symptom)
    if (v !== undefined) d.max = Math.max(d.max ?? 0, v)
    mergedTags(e.layers).forEach((t) => d.tags.add(t))
    days.set(k, d)
  }
  const all = [...days.values()].flatMap((d) => (d.max === undefined ? [] : [{ max: d.max, tags: d.tags }]))
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

/** `count`: the days the symptom was recorded on. */
export type SymptomMean = { symptom: Symptom; mean: number; count: number }

/** Mean of every symptom but `except` (the one picked, §6.3), per day then across days, where it was recorded above zero. */
export function symptomMeans(entries: Entry[], symptoms: Symptom[], except = PAIN): SymptomMean[] {
  return symptoms
    .filter((s) => s.id !== except)
    .flatMap((symptom) => {
      const vals = entries.flatMap((e) => {
        const v = readings(e)[symptom.id]
        return typeof v === 'number' && v > 0 ? [{ at: e.at, v }] : []
      })
      const m = dailyMean(vals)
      return m ? [{ symptom, mean: m.mean, count: m.days }] : []
    })
    .sort((a, b) => b.mean - a.mean)
}

/**
 * The symptoms read in range, a reading of 0 included, disabled ones too (they stay in history), in vocabulary order:
 * the Trends picker, whose first is where it opens (§6.3). Ids the vocabulary no longer knows are left out.
 */
export function symptomsRead(entries: Entry[], symptoms: Symptom[]): Symptom[] {
  const ids = new Set(entries.flatMap((e) => e.layers.flatMap((l) => Object.keys(l.readings))))
  return symptoms.filter((s) => ids.has(s.id)).sort((a, b) => a.order - b.order)
}

const GROUP_RANK: Record<Tag['group'], number> = { medication: 0, intervention: 1, context: 2 }

/**
 * Tag use in the range, in **days** (§6.3): three doses on one day are one day of medication, as clinicians count it
 * (days per month). Medications first, then remedies, then context; the most used first within each.
 */
export function tagCounts(entries: Entry[], tags: Tag[]): { tag: Tag; days: number }[] {
  const days = new Map<string, Set<string>>()
  for (const e of entries) for (const t of mergedTags(e.layers)) days.set(t, (days.get(t) ?? new Set()).add(dayKey(e.at)))
  return tags
    .map((tag) => ({ tag, days: days.get(tag.id)?.size ?? 0 }))
    .filter((x) => x.days > 0)
    .sort((a, b) => GROUP_RANK[a.tag.group] - GROUP_RANK[b.tag.group] || b.days - a.days)
}

export type PresetPoint = { at: number; value: number }

/**
 * One line per preset that has samples: one symptom over time (the lead one when the preset asks for it), samples only, no carry-forward. An update
 * of an episode opened from a preset is a sample of it, even when the episode began before the range: `earlier` holds
 * the heads outside `entries`. A sample without the reading is skipped: no reading is not a 0.
 */
export function presetSeries(entries: Entry[], presets: Preset[], earlier: Entry[] = [], symptoms: Symptom[] = []): { preset: Preset; points: PresetPoint[] }[] {
  const lead = leadSymptom(symptoms)
  const heads = new Map([...earlier, ...entries].filter((e) => e.presetId && e.episodeId === e.id).map((e) => [e.id, e]))
  return presets
    .map((preset) => {
      // The lead symptom when any layer asks for it, else the first thing its first layer asks (§6.3).
      const id = lead && preset.layers.some((l) => l.asks?.includes(lead)) ? lead : (preset.layers[0]?.asks?.[0] ?? lead)
      if (id === undefined) return { preset, points: [] }
      const points = entries
        .filter((e) => presetOf(e, heads) === preset.id)
        .flatMap((e) => {
          const value = readings(e)[id]
          return value === undefined ? [] : [{ at: Date.parse(e.at), value }]
        })
        .sort((a, b) => a.at - b.at)
      return { preset, points }
    })
    .filter((r) => r.points.length > 0)
}
