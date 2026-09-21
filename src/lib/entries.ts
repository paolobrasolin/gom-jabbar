import { nanoid } from 'nanoid'
import { db } from './db'
import { PAIN, type Entry } from './types'
import { finalize, overallPain, isMindOnly, bodyAreas, type Area } from './areas'
import { mindMax } from './vocabulary'

export type EntryInput = {
  at?: string
  ongoing?: boolean
  readings?: Record<string, number>
  areas?: Area[]
  tags?: string[]
  note?: string
  preset?: string
}

const now = () => new Date().toISOString()

export function makeEntry(input: EntryInput): Entry {
  const ts = now()
  const areas = finalize(input.areas ?? [])
  const readings = withPain({ ...(input.readings ?? {}) }, areas)
  return {
    id: nanoid(),
    at: input.at ?? ts,
    endedAt: null,
    ongoing: input.ongoing ?? false,
    readings,
    areas,
    tags: [...(input.tags ?? [])],
    note: input.note ?? '',
    ...(input.preset ? { preset: input.preset } : {}),
    createdAt: ts,
    updatedAt: ts,
  }
}

/** Pain is the max over areas when there are any; otherwise whatever was given (default 0). */
export function withPain(readings: Record<string, number>, areas: Area[]): Record<string, number> {
  return { ...readings, [PAIN]: overallPain(areas, readings[PAIN] ?? 0) }
}

export async function addEntry(input: EntryInput): Promise<Entry> {
  const entry = makeEntry(input)
  await db.entries.add(entry)
  return entry
}

export async function updateEntry(id: string, patch: Partial<Omit<Entry, 'id' | 'createdAt'>>): Promise<Entry | undefined> {
  const next = { ...patch, updatedAt: now() }
  if (next.areas) {
    next.areas = finalize(next.areas)
    const current = next.readings ?? (await db.entries.get(id))?.readings ?? {}
    next.readings = withPain(current, next.areas)
  }
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

/** End an episode, optionally recording the tags (remedies, medications) that go with it. */
export async function endEpisode(id: string, at: string = now(), tags?: string[]): Promise<Entry | undefined> {
  return updateEntry(id, { ongoing: false, endedAt: at, ...(tags ? { tags: [...tags] } : {}) })
}

export async function reopenEpisode(id: string): Promise<Entry | undefined> {
  return updateEntry(id, { ongoing: true, endedAt: null })
}

/**
 * Record new readings on an ongoing episode. Unmentioned symptoms keep their level. A single body area
 * follows the pain reading; several keep their initial split; an area holding only the mind follows the
 * highest mental reading. The first update also stores where the episode started, so the history is the complete trail.
 * `tags`, when given, replace the entry's.
 */
export async function updateEpisode(id: string, readings: Record<string, number>, at: string = now(), tags?: string[]): Promise<Entry | undefined> {
  const e = await db.entries.get(id)
  if (!e) return undefined
  const next = { ...e.readings, ...readings }
  const pain = next[PAIN] ?? 0
  const mind = mindMax(next, await db.symptoms.toArray())
  const oneBody = bodyAreas(e.areas).length === 1
  const areas = e.areas.map((a) => (isMindOnly(a) ? { ...a, intensity: mind } : oneBody ? { ...a, intensity: pain } : a))
  const history = e.history?.length ? [...e.history] : [{ at: e.at, readings: { ...e.readings } }]
  history.push({ at, readings: next })
  await db.entries.update(id, { readings: next, areas, history, updatedAt: now(), ...(tags ? { tags: [...tags] } : {}) })
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
