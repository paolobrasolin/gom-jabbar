import { nanoid } from 'nanoid'
import { db } from './db'
import { addEntry } from './entries'
import { finalize, mindOnly, isMindArea } from './areas'
import { mindMax } from './vocabulary'
import { PAIN, type Entry, type Preset } from './types'
import type { EntryDraft } from './draft'

export type PresetInput = Omit<Preset, 'id' | 'order'>

/** What a filled form would save, as a reusable shape: pain is always tracked (unless only the mind is selected), other symptoms when set above 0. */
export function presetFromDraft(d: EntryDraft, name: string): PresetInput {
  const areas = finalize(d.areas)
  const others = Object.entries(d.readings)
    .filter(([id, v]) => id !== PAIN && v > 0)
    .map(([id]) => id)
  return { name: name.trim(), areas, symptomIds: [...(mindOnly(areas) ? [] : [PAIN]), ...others], tags: [...d.tags], ongoing: d.ongoing }
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

/** Log an ordinary moment from a preset: its body areas at the pain level given, the mind at the highest mental one, its tags, its episode flag. */
export async function logPreset(preset: Preset, readings: Record<string, number>, at?: string): Promise<Entry> {
  const pain = readings[PAIN] ?? 0
  const mind = mindMax(readings, await db.symptoms.toArray())
  return addEntry({
    at,
    ongoing: preset.ongoing,
    readings,
    areas: preset.areas.map((a) => ({ ...a, intensity: isMindArea(a) ? mind : pain })),
    tags: preset.tags,
    note: '',
    preset: preset.id,
  })
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
