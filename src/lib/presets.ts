import { nanoid } from 'nanoid'
import { db } from './db'
import { addEntry } from './entries'
import { finalize, hasBody, readingsFor, showsCategory } from './layers'
import { PAIN, type Entry, type Preset } from './types'
import type { EntryDraft } from './draft'

export type PresetInput = Omit<Preset, 'id' | 'order'>

/**
 * What a filled form would save, as a reusable shape: the layers as they stand, and the sliders to ask for:
 * pain first when some layer shows it, then every other symptom set above 0 on any layer.
 */
export function presetFromDraft(d: EntryDraft, name: string): PresetInput {
  const layers = finalize(d.layers)
  const pain = layers.some((l) => showsCategory(l, 'body'))
  const others = [...new Set(layers.flatMap((l) => Object.entries(l.readings).filter(([id, v]) => id !== PAIN && v > 0).map(([id]) => id)))]
  return { name: name.trim(), layers, symptomIds: [...(pain ? [PAIN] : []), ...others], kind: d.kind }
}

export async function addPreset(input: PresetInput): Promise<Preset> {
  const last = await db.presets.orderBy('order').last()
  const p: Preset = { id: nanoid(), ...input, order: (last?.order ?? -1) + 1 }
  await db.presets.add(p)
  return p
}

export async function deletePreset(id: string): Promise<Preset | undefined> {
  const p = await db.presets.get(id)
  if (p) await db.presets.delete(id)
  return p
}

export async function restorePreset(p: Preset): Promise<void> {
  await db.presets.put(p)
}

/** Log from a preset: its layers, each taking the readings it shows from the sheet's, a snapshot or an episode as its kind says, an empty note. */
export async function logPreset(preset: Preset, readings: Record<string, number>, at?: string): Promise<Entry> {
  const symptoms = await db.symptoms.toArray()
  const layers = preset.layers.map((l) => ({ ...l, readings: readingsFor(l, readings, symptoms) }))
  // A body layer always records its pain, 0 when the preset does not ask for it.
  for (const l of layers) if (hasBody(l) && l.readings[PAIN] === undefined) l.readings[PAIN] = 0
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
