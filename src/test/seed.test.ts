import { describe, it, expect, beforeEach } from 'vitest'
import { buildSeed } from './seed'
import { FIGURES } from '../lib/figures'
import { REGIONS, FULL_BODY, MIND } from '../lib/regions'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from '../lib/vocabulary'
import { EXPORT_VERSION, parseImport, applyImport, buildExport } from '../lib/backup'
import { finalize } from '../lib/layers'
import { resetDb } from '../lib/db'
import { isHead, isUpdate } from '../lib/entries'
import type { Entry } from '../lib/types'

const NOW = new Date('2026-10-01T10:17:00.000Z')
const seed = buildSeed({ now: NOW, figures: FIGURES, symptoms: DEFAULT_SYMPTOMS, tags: DEFAULT_TAGS })
const { entries, presets } = seed
const { symptoms, tags } = seed.vocabulary
const heads = entries.filter(isHead)
const updatesOf = (h: Entry) => entries.filter((e) => isUpdate(e) && e.episodeId === h.id)
const readingsOf = (e: Entry) => e.layers.map((l) => l.readings)

beforeEach(() => {
  resetDb()
})

describe('the demo seed (scripts/seed.mjs)', () => {
  it('is a backup of the current version that import and export leave exactly as it is', async () => {
    expect(seed.version).toBe(EXPORT_VERSION)
    expect(parseImport(JSON.stringify(seed))).toEqual(seed)
    await applyImport(parseImport(JSON.stringify(seed)), 'replace')
    expect({ ...(await buildExport()), exportedAt: seed.exportedAt }).toEqual(seed)
  })

  it('is what the app itself would store: layers as saved, every stroke inside its segment', () => {
    for (const e of entries) expect(finalize(e.layers, symptoms)).toEqual(e.layers)
    const choir = new Map(REGIONS.map((r) => [r.id, r.choir]))
    const inside = ([x, y]: [number, number], poly: [number, number][]) => {
      let c = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i]
        const [xj, yj] = poly[j]
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
      }
      return c
    }
    const strokes = [...entries.flatMap((e) => e.layers), ...presets.flatMap((p) => p.layers)].flatMap((l) => l.strokes ?? [])
    expect(strokes.length).toBeGreaterThan(5)
    for (const s of strokes) for (const p of s.points) expect(inside(p, FIGURES[s.fig][s.view][choir.get(s.region)!])).toBe(true)
  })

  it('never lies in the future, and every episode reads in order: start, updates, end', () => {
    for (const e of entries) expect(Date.parse(e.at)).toBeLessThanOrEqual(NOW.getTime())
    // A switched-off symptom has no slider: nothing reads it after it went off.
    const off = symptoms.find((s) => !s.enabled)!
    const lastOff = Math.max(...entries.filter((e) => readingsOf(e).some((r) => off.id in r)).map((e) => Date.parse(e.at)))
    expect(NOW.getTime() - lastOff).toBeGreaterThan(14 * 24 * 3600_000)
    for (const h of heads) {
      const times = updatesOf(h).map((u) => Date.parse(u.at))
      expect(times.every((t) => t > Date.parse(h.at))).toBe(true)
      if (h.endedAt) expect(times.every((t) => t < Date.parse(h.endedAt!))).toBe(true)
      if (h.endedAt) expect(Date.parse(h.endedAt)).toBeLessThanOrEqual(NOW.getTime())
    }
  })

  it('shows every shape the tester logs, so a screenshot review sees them', () => {
    const readings = entries.flatMap(readingsOf)
    const layers = entries.flatMap((e) => e.layers)
    // Episodes: ended chains with updates, exactly one going on, some from a preset.
    expect(heads.filter((h) => h.endedAt && updatesOf(h).length >= 2).length).toBeGreaterThanOrEqual(5)
    expect(heads.filter((h) => h.endedAt === null)).toHaveLength(1)
    expect(updatesOf(heads.find((h) => h.endedAt === null)!).length).toBeGreaterThanOrEqual(1)
    expect(heads.some((h) => h.presetId)).toBe(true)
    // Presets of both kinds, each used.
    expect(new Set(presets.map((p) => p.kind))).toEqual(new Set(['chronic', 'episode']))
    for (const p of presets) expect(entries.some((e) => e.presetId === p.id)).toBe(true)
    // Pain 0, the mind, several layers, full body (rare), a reading without a place, drawn strokes on both figures.
    expect(readings.some((r) => r.pain === 0)).toBe(true)
    expect(layers.some((l) => l.regions.includes(MIND))).toBe(true)
    expect(entries.some((e) => e.layers.length > 1)).toBe(true)
    const full = entries.filter((e) => e.layers.some((l) => l.regions.includes(FULL_BODY))).length
    expect(full).toBeGreaterThan(0)
    expect(full / entries.length).toBeLessThan(0.05)
    expect(layers.some((l) => !l.regions.length)).toBe(true)
    expect(new Set(layers.flatMap((l) => l.strokes ?? []).map((s) => s.fig))).toEqual(new Set(['female', 'male']))
    // Vocabulary as a person leaves it: a symptom and tags of their own, a renamed one, switched-off ones still in history.
    const own = (l: string) => !l.startsWith('i18n:')
    const custom = symptoms.find((s) => !DEFAULT_SYMPTOMS.some((d) => d.id === s.id))!
    expect(readings.some((r) => custom.id in r)).toBe(true)
    expect(symptoms.some((s) => DEFAULT_SYMPTOMS.some((d) => d.id === s.id) && own(s.label))).toBe(true)
    const off = symptoms.find((s) => !s.enabled)!
    expect(readings.some((r) => off.id in r)).toBe(true)
    const meds = tags.filter((t) => t.group === 'medication')
    expect(meds.length).toBeGreaterThanOrEqual(1)
    expect(layers.some((l) => l.tags.some((id) => meds.some((m) => m.id === id)))).toBe(true)
    expect(tags.some((t) => !t.enabled)).toBe(true)
    // Notes now and then.
    expect(entries.some((e) => e.note)).toBe(true)
  })

  it('is the same file every time for the same day', () => {
    expect(buildSeed({ now: NOW, figures: FIGURES, symptoms: DEFAULT_SYMPTOMS, tags: DEFAULT_TAGS })).toEqual(seed)
  })
})
