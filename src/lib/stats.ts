import { PAIN, type Entry, type Preset, type Symptom, type Tag } from './types'
import { FULL_BODY } from './regions'
import { durationMs, episodesOf, isHead, shownReading } from './entries'
import { presetOf } from './presets'
import { mergedReadings, mergedTags } from './layers'
import { dayKey } from './time'
import { leadSymptom } from './vocabulary'
import { entryHeadline } from './summary'

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

/** The range's calendar days as day keys, in order: the chart's columns and the tag rows' marks (#120). */
export function rangeDays(from: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(from)
    date.setDate(from.getDate() + i)
    return dayKey(date.toISOString())
  })
}

export type DayPoint = { day: string; date: Date; max: number | null; mean: number | null; count: number }

/** One point per calendar day in [from, from + days), over the entries reading the symptom. Days without any have null values. */
export function dailySeries(entries: Entry[], from: Date, days: number, symptom = PAIN): DayPoint[] {
  return daySeries(withLevel(entries, symptom).map(({ e, v }) => ({ at: e.at, value: v })), from, days)
}

/** The same days from readings already picked: a chronic preset's own, in the Preset cronici fold (#120). */
function daySeries(readings: { at: string; value: number }[], from: Date, days: number): DayPoint[] {
  const byDay = new Map<string, number[]>()
  for (const { at, value } of readings) {
    const k = dayKey(at)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(value)
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

const median = (vs: number[]): number | null => {
  if (!vs.length) return null
  const s = [...vs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export type Summary = {
  entries: number
  /** The chronic readings and the days they were on, apart from episodes, as the log form's Tipo has them (#120). */
  chronicEntries: number
  chronicDays: number
  /** The symptom's mean per day, then across days, and its max, over the entries reading it; null when none does. */
  mean: number | null
  max: number | null
  /**
   * Each day reading the symptom counted once at its worst, level by level: `worst[4]` is how many days were at worst
   * 4 (#114). A mean to one decimal swings on one bad day and the scale is ordinal; this is the shape of the range.
   */
  worst: number[]
  /** The median of those days' worst, null when none reads the symptom. */
  median: number | null
  episodes: number
  /**
   * The median length of the episodes that have ended; null when none has (§6.3). An episode still going on is not a
   * length yet: counted in `ongoing`, never at its time so far, so a forgotten Termina cannot inflate it.
   */
  medianEpisodeMs: number | null
  ongoing: number
}

export function summarize(entries: Entry[], symptom = PAIN, now = Date.now()): Summary {
  const read = withLevel(entries, symptom)
  const vs = read.map((r) => r.v)
  const dayMax = new Map<string, number>()
  for (const { e, v } of read) dayMax.set(dayKey(e.at), Math.max(dayMax.get(dayKey(e.at)) ?? 0, v))
  const chronic = entries.filter((e) => e.kind === 'chronic')
  const heads = entries.filter(isHead)
  const ended = heads.filter((e) => e.endedAt).map((e) => durationMs(e, now)!).sort((a, b) => a - b)
  const mid = ended.length >> 1
  return {
    entries: entries.length,
    chronicEntries: chronic.length,
    chronicDays: new Set(chronic.map((e) => dayKey(e.at))).size,
    mean: dailyMean(read.map(({ e, v }) => ({ at: e.at, v })))?.mean ?? null,
    max: vs.length ? Math.max(...vs) : null,
    worst: [...dayMax.values()].reduce((n, v) => (n[Math.min(10, Math.max(0, Math.round(v)))]++, n), Array<number>(11).fill(0)),
    median: median([...dayMax.values()]),
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
 * nothing. The mind is one more region. Full body is no region: counted for every one, a single such entry lit all 74
 * and diluted each (#114). It is counted apart (`fullBody`).
 */
export function regionHeat(entries: Entry[], symptom = PAIN): Map<string, Heat> {
  const acc = new Map<string, { sum: number; count: number }>()
  for (const e of entries) {
    const best = new Map<string, number>()
    for (const l of e.layers) {
      const v = l.readings[symptom]
      if (typeof v !== 'number') continue
      for (const id of l.regions) if (id !== FULL_BODY) best.set(id, Math.max(best.get(id) ?? 0, v))
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

/**
 * The entries that read the symptom on the whole body (§6.3), shown beside the map rather than on every region: how many,
 * and their mean, each entry at the max over its full-body layers that carry it. Null when there are none.
 */
export function fullBody(entries: Entry[], symptom = PAIN): { mean: number; count: number } | null {
  const vs = entries.flatMap((e) => {
    const own = e.layers.filter((l) => l.regions.includes(FULL_BODY) && typeof l.readings[symptom] === 'number').map((l) => l.readings[symptom])
    return own.length ? [Math.max(...own)] : []
  })
  return vs.length ? { mean: vs.reduce((a, b) => a + b, 0) / vs.length, count: vs.length } : null
}

/** The heatmap's frequency ring (§6.3), in screen px inside the region: a hairline for once, 2.5px for the most frequent. */
export const ringWidth = (weight: number) => 0.75 + 1.75 * weight
/** The ring as drawn: twice the width, clipped to the region, so only the inner half shows. */
export const ringStyle = (weight: number) => `stroke-width:${(2 * ringWidth(weight)).toFixed(2)}px`

/** Tags are listed medications first, then remedies, then context (§6.3). */
const GROUP_RANK: Record<Tag['group'], number> = { medication: 0, intervention: 1, context: 2 }

/** `count`: the days the symptom was recorded on. */
export type SymptomMean = { symptom: Symptom; mean: number; count: number }

/**
 * Mean of every symptom but `except` (the one picked, §6.3), per day then across days, over the entries reading it, a 0
 * included: the same number its card shows when that symptom is picked (#114; until then a 0 was left out here). In
 * vocabulary order, as the picker lists them: sorted by mean, a symptom read on one bad day led one read on twenty (#120).
 */
export function symptomMeans(entries: Entry[], symptoms: Symptom[], except = PAIN): SymptomMean[] {
  return [...symptoms]
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.id !== except)
    .flatMap((symptom) => {
      const m = dailyMean(withLevel(entries, symptom.id).map(({ e, v }) => ({ at: e.at, v })))
      return m ? [{ symptom, mean: m.mean, count: m.days }] : []
    })
}

/**
 * The symptoms read in range, a reading of 0 included, disabled ones too (they stay in history), in vocabulary order:
 * the Trends picker, whose first is where it opens (§6.3). Ids the vocabulary no longer knows are left out.
 */
export function symptomsRead(entries: Entry[], symptoms: Symptom[]): Symptom[] {
  const ids = new Set(entries.flatMap((e) => e.layers.flatMap((l) => Object.keys(l.readings))))
  return symptoms.filter((s) => ids.has(s.id)).sort((a, b) => a.order - b.order)
}

/**
 * Tag use in the range, in **days** (§6.3): three doses on one day are one day of medication, as clinicians count it
 * (days per month). Medications first, then remedies, then context; the most used first within each. `on` is the days
 * themselves, in order, where the rows under the chart put their marks (#120).
 */
export function tagCounts(entries: Entry[], tags: Tag[]): { tag: Tag; days: number; on: string[] }[] {
  const days = new Map<string, Set<string>>()
  for (const e of entries) for (const t of mergedTags(e.layers)) days.set(t, (days.get(t) ?? new Set()).add(dayKey(e.at)))
  return tags
    .map((tag) => ({ tag, days: days.get(tag.id)?.size ?? 0, on: [...(days.get(tag.id) ?? [])].sort() }))
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

/**
 * The chronic presets with samples in range, each by day as the Quando chart draws a symptom (#120): the day's highest reading
 * of its symptom (`presetSeries`), a day without one empty. Episode presets have their bars (`episodeLanes`).
 */
export function chronicRows(entries: Entry[], presets: Preset[], earlier: Entry[], symptoms: Symptom[], from: Date, days: number): { preset: Preset; count: number; series: DayPoint[] }[] {
  return presetSeries(entries, presets, earlier, symptoms)
    .filter((r) => r.preset.kind === 'chronic')
    .map((r) => ({ preset: r.preset, count: r.points.length, series: daySeries(r.points.map((p) => ({ at: new Date(p.at).toISOString(), value: p.value })), from, days) }))
}

/** One episode as a bar over the range's days (#120): its first and last day as column indexes, its level, its row in its lane. */
export type EpisodeBar = { id: string; first: number; last: number; level: number; row: number }
/** The episodes opened from one episode preset, or, with `preset` null, every other one; `count` the bars it draws. */
export type EpisodeLane = { preset: Preset | null; count: number; rows: number; bars: EpisodeBar[] }

/**
 * Every episode that touched the range, `chains` holding each one whole (head and updates), as a bar from the day it
 * began to the day it ended, today while it goes on, clipped to the range; at the level shown for it everywhere (§5.5,
 * `shownReading`): its latest reading while it goes on, its highest once ended. One lane per episode preset, in their
 * order, then the rest; bars that overlap take another row.
 */
export function episodeLanes(chains: Entry[], presets: Preset[], from: Date, days: number, lead?: string, now = Date.now()): EpisodeLane[] {
  const keys = rangeDays(from, days)
  const index = new Map(keys.map((k, i) => [k, i]))
  const day = (iso: string): number => index.get(dayKey(iso)) ?? (dayKey(iso) < keys[0] ? -1 : days)
  const lanes = new Map<string, EpisodeBar[]>()
  for (const ep of [...episodesOf(chains).values()].sort((a, b) => a.head.at.localeCompare(b.head.at))) {
    const start = day(ep.head.at)
    const end = day(ep.head.endedAt ?? new Date(now).toISOString())
    if (end < 0 || start >= days) continue
    const own = presets.find((p) => p.id === ep.head.presetId && p.kind === 'episode')
    const lane = lanes.get(own?.id ?? '') ?? []
    lanes.set(own?.id ?? '', lane)
    const first = Math.max(0, start)
    const last = Math.min(days - 1, end)
    const taken = lane.filter((b) => b.last >= first).map((b) => b.row)
    let row = 0
    while (taken.includes(row)) row++
    lane.push({ id: ep.head.id, first, last, level: entryHeadline(shownReading(ep), lead).value, row })
  }
  const order = [...presets.filter((p) => p.kind === 'episode').sort((a, b) => a.order - b.order), null]
  return order.flatMap((preset) => {
    const lane = lanes.get(preset?.id ?? '')
    return lane ? [{ preset, count: lane.length, rows: Math.max(...lane.map((b) => b.row)) + 1, bars: lane }] : []
  })
}

/**
 * The episodes begun in range (`heads`), counted per week from the range's first day, the last week the one still
 * going on, or past four months per calendar month, the first from the range's first day (#120).
 */
export function episodeCounts(heads: Entry[], from: Date, days: number): { per: 'week' | 'month'; buckets: { start: Date; count: number }[] } {
  const keys = rangeDays(from, days)
  const per = days > 120 ? 'month' : 'week'
  const starts: Date[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(from)
    d.setDate(from.getDate() + i)
    if (per === 'week' ? i % 7 === 0 : i === 0 || d.getDate() === 1) starts.push(d)
  }
  const startKeys = starts.map((d) => dayKey(d.toISOString()))
  const counts = starts.map(() => 0)
  for (const h of heads) {
    const k = dayKey(h.at)
    if (k < keys[0] || k > keys[days - 1]) continue
    let b = 0
    while (b + 1 < startKeys.length && startKeys[b + 1] <= k) b++
    counts[b]++
  }
  return { per, buckets: starts.map((start, i) => ({ start, count: counts[i] })) }
}
