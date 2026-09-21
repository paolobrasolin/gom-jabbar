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
  return { name: name.trim(), layers, symptomIds: [...(pain ? [PAIN] : []), ...others], ongoing: d.ongoing }
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

/** Log an ordinary moment from a preset: its layers, each taking the readings it shows from the sheet's, its episode flag, an empty note. */
export async function logPreset(preset: Preset, readings: Record<string, number>, at?: string): Promise<Entry> {
  const symptoms = await db.symptoms.toArray()
  const layers = preset.layers.map((l) => ({ ...l, readings: readingsFor(l, readings, symptoms) }))
  // A body layer always records its pain, 0 when the preset does not ask for it.
  for (const l of layers) if (hasBody(l) && l.readings[PAIN] === undefined) l.readings[PAIN] = 0
  return addEntry({ at, ongoing: preset.ongoing, layers, note: '', preset: preset.id })
}

/** The most recent entry logged from a preset, for the "last value · how long ago" chip. */
export async function lastForPreset(id: string): Promise<Entry | undefined> {
  const rows = await db.entries.where('preset').equals(id).sortBy('at')
  return rows[rows.length - 1]
}

/** Last entry per preset id, from all entries that carry one. */
export function lastByPreset(entries: Entry[]): Record<string, Entry> {
  const out: Record<string, Entry> = {}
  for (const e of entries) if (e.preset && (!out[e.preset] || e.at > out[e.preset].at)) out[e.preset] = e
  return out
}
