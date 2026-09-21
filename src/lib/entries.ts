import { nanoid } from 'nanoid'
import { db } from './db'
import { finalize, newLayer, type Layer, type Stroke } from './layers'
import type { Entry, Symptom } from './types'

export type LayerInput = { regions?: string[]; readings?: Record<string, number>; tags?: string[]; strokes?: Stroke[] }

/** `readings` and `tags` without `layers` are a shorthand for one layer without regions. */
export type EntryInput = {
  at?: string
  ongoing?: boolean
  layers?: LayerInput[]
  readings?: Record<string, number>
  tags?: string[]
  note?: string
  preset?: string
}

const now = () => new Date().toISOString()

const toLayer = (l: LayerInput): Layer => ({ regions: l.regions ?? [], readings: { ...(l.readings ?? {}) }, tags: [...(l.tags ?? [])], ...(l.strokes ? { strokes: l.strokes } : {}) })

/** An entry as it will be stored. With the vocabulary given, each layer keeps only the readings its regions show (§6.1). */
export function makeEntry(input: EntryInput, symptoms?: Symptom[]): Entry {
  const ts = now()
  const raw = input.layers ? input.layers.map(toLayer) : [{ ...newLayer(input.readings ?? {}), tags: [...(input.tags ?? [])] }]
  const layers = finalize(raw.length ? raw : [newLayer()], symptoms)
  return {
    id: nanoid(),
    at: input.at ?? ts,
    endedAt: null,
    ongoing: input.ongoing ?? false,
    layers,
    note: input.note ?? '',
    ...(input.preset ? { preset: input.preset } : {}),
    createdAt: ts,
    updatedAt: ts,
  }
}

export async function addEntry(input: EntryInput): Promise<Entry> {
  const entry = makeEntry(input, await db.symptoms.toArray())
  await db.entries.add(entry)
  return entry
}

export async function updateEntry(id: string, patch: Partial<Omit<Entry, 'id' | 'createdAt'>>): Promise<Entry | undefined> {
  const next = { ...patch, updatedAt: now() }
  if (next.layers) next.layers = finalize(next.layers, await db.symptoms.toArray())
  await db.entries.update(id, next)
  return db.entries.get(id)
}

export async function deleteEntry(id: string): Promise<Entry | undefined> {
  const entry = await db.entries.get(id)
  if (entry) await db.entries.delete(id)
  return entry
}

export async function restoreEntry(entry: Entry): Promise<void> {
  await db.entries.put(entry)
}

/** Tags per layer, aligned with the entry's layers; a missing list leaves that layer's tags alone. */
export type LayerTags = (string[] | undefined)[]

function withTags(layers: Layer[], tags?: LayerTags): Layer[] {
  if (!tags) return layers
  return layers.map((l, i) => (tags[i] ? { ...l, tags: [...tags[i]!] } : l))
}

/** End an episode, optionally recording the tags (remedies, medications) that go with it, per layer. */
export async function endEpisode(id: string, at: string = now(), tags?: LayerTags): Promise<Entry | undefined> {
  const e = await db.entries.get(id)
  if (!e) return undefined
  return updateEntry(id, { ongoing: false, endedAt: at, ...(tags ? { layers: withTags(e.layers, tags) } : {}) })
}

export async function reopenEpisode(id: string): Promise<Entry | undefined> {
  return updateEntry(id, { ongoing: true, endedAt: null })
}

/**
 * Record new readings on an ongoing episode, one record per layer (§5.5). Unmentioned symptoms and layers
 * keep their levels. The first update also stores where the episode started, so the history is the complete
 * trail. `tags`, when given, replace the layers' own.
 */
export async function updateEpisode(id: string, readings: (Record<string, number> | undefined)[], at: string = now(), tags?: LayerTags): Promise<Entry | undefined> {
  const e = await db.entries.get(id)
  if (!e) return undefined
  const layers = withTags(
    e.layers.map((l, i) => (readings[i] ? { ...l, readings: { ...l.readings, ...readings[i] } } : l)),
    tags,
  )
  const history = e.history?.length ? [...e.history] : [{ at: e.at, layers: e.layers.map((l) => ({ ...l.readings })) }]
  history.push({ at, layers: layers.map((l) => ({ ...l.readings })) })
  await db.entries.update(id, { layers, history, updatedAt: now() })
  return db.entries.get(id)
}

export function activeEpisodes(): Promise<Entry[]> {
  return db.entries.filter((e) => e.ongoing).sortBy('at')
}

export function durationMs(entry: Entry, nowMs = Date.now()): number | null {
  if (!entry.ongoing && !entry.endedAt) return null
  const end = entry.endedAt ? Date.parse(entry.endedAt) : nowMs
  return Math.max(0, end - Date.parse(entry.at))
}
