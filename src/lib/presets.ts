import { nanoid } from 'nanoid'
import { db } from './db'
import { addEntry } from './entries'
import { finalize, hasBody, keptLayers, showsCategory, type Layer } from './layers'
import { PAIN, type Entry, type Preset, type PresetLayer, type Symptom, type SymptomId } from './types'
import type { EntryDraft } from './draft'

export type PresetInput = Omit<Preset, 'id' | 'order'>

/** The sliders a layer asks for by default (§5.6): pain when it shows the body, then every other symptom set above 0 on it. */
export function defaultAsks(l: Layer): SymptomId[] {
  const others = Object.entries(l.readings).filter(([id, v]) => id !== PAIN && v > 0).map(([id]) => id)
  return [...(showsCategory(l, 'body') ? [PAIN] : []), ...others]
}

/**
 * What a filled form would save as a reusable shape (§5.6): each kept layer's regions and paint, and what it asks for,
 * its own list when the form set one, else the default. Readings and tags stay behind: a reading is set at each save,
 * a tag is a fact about one reading. With the vocabulary, a layer asks only what its regions show (§6.1).
 */
export function presetFromDraft(d: EntryDraft, name: string, symptoms?: Symptom[]): PresetInput {
  const src = keptLayers(d.layers)
  const category = symptoms ? new Map(symptoms.map((s) => [s.id, s.category])) : null
  const layers = finalize(src, symptoms).map((l, i): PresetLayer => {
    const asks = (src[i].asks ?? defaultAsks(l)).filter((id) => {
      const c = category?.get(id)
      return !c || showsCategory(l, c)
    })
    return { regions: l.regions, asks: [...new Set(asks)], ...(l.strokes ? { strokes: l.strokes } : {}) }
  })
  return { name: name.trim(), layers, kind: d.kind }
}

export async function addPreset(input: PresetInput): Promise<Preset> {
  const last = await db.presets.orderBy('order').last()
  const p: Preset = { id: nanoid(), ...input, order: (last?.order ?? -1) + 1 }
  await db.presets.add(p)
  return p
}

/** Edit in place: the same id and order, so every entry logged from it stays in its stream. */
export async function updatePreset(id: string, input: PresetInput): Promise<Preset | undefined> {
  const p = await db.presets.get(id)
  if (!p) return undefined
  const next: Preset = { ...input, id, order: p.order }
  await db.presets.put(next)
  return next
}

export async function deletePreset(id: string): Promise<Preset | undefined> {
  const p = await db.presets.get(id)
  if (p) await db.presets.delete(id)
  return p
}

export async function restorePreset(p: Preset): Promise<void> {
  await db.presets.put(p)
}

/** Log from a preset: each layer with its own levels from the sheet, no tags, a snapshot or an episode as its kind says, an empty note. */
export async function logPreset(preset: Preset, levels: Record<string, number>[], at?: string): Promise<Entry> {
  const layers = preset.layers.map((l, i) => {
    const readings: Record<string, number> = {}
    for (const id of l.asks) readings[id] = levels[i]?.[id] ?? 0
    // A body layer always records its pain, 0 when the preset does not ask for it.
    if (hasBody(l) && readings[PAIN] === undefined) readings[PAIN] = 0
    return { regions: [...l.regions], readings, tags: [], ...(l.strokes ? { strokes: l.strokes } : {}) }
  })
  return addEntry({ at, kind: preset.kind, layers, note: '', presetId: preset.id })
}

/** The preset an entry was logged from: its own, or its head's for an update of an episode. */
export function presetOf(e: Entry, heads: Map<string, Entry>): string | undefined {
  return e.presetId ?? (e.episodeId ? heads.get(e.episodeId)?.presetId : undefined)
}

/** The latest reading per preset id: an update of an episode counts for the preset that opened it. */
export function lastByPreset(entries: Entry[]): Record<string, Entry> {
  const heads = new Map(entries.filter((e) => e.presetId && e.episodeId === e.id).map((e) => [e.id, e]))
  const out: Record<string, Entry> = {}
  for (const e of entries) {
    const p = presetOf(e, heads)
    if (p && (!out[p] || e.at > out[p].at)) out[p] = e
  }
  return out
}

/** Every entry logged from any preset, updates of their episodes included, for the "last value · how long ago" chips. */
export async function presetEntries(): Promise<Entry[]> {
  const own = await db.entries.filter((e) => !!e.presetId).toArray()
  const heads = own.filter((e) => e.episodeId === e.id)
  const updates = heads.length ? await db.entries.where('episodeId').anyOf(heads.map((h) => h.id)).toArray() : []
  const seen = new Set(own.map((e) => e.id))
  return [...own, ...updates.filter((u) => !seen.has(u.id))]
}

/** The most recent reading logged from a preset. */
export async function lastForPreset(id: string): Promise<Entry | undefined> {
  return lastByPreset(await presetEntries())[id]
}
