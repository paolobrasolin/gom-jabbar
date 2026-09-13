import { nanoid } from 'nanoid'
import { db } from './db'
import { PAIN, type Entry } from './types'
import { finalize, overallPain, type Area } from './areas'

export type EntryInput = {
  at?: string
  ongoing?: boolean
  readings?: Record<string, number>
  areas?: Area[]
  tags?: string[]
  note?: string
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

export async function endEpisode(id: string, at: string = now()): Promise<Entry | undefined> {
  return updateEntry(id, { ongoing: false, endedAt: at })
}

export async function reopenEpisode(id: string): Promise<Entry | undefined> {
  return updateEntry(id, { ongoing: true, endedAt: null })
}

/** Record a new overall level on an ongoing episode. A single area follows it; several keep their initial split. */
export async function updateEpisodeIntensity(id: string, pain: number, at: string = now()): Promise<Entry | undefined> {
  const e = await db.entries.get(id)
  if (!e) return undefined
  const areas = e.areas.length === 1 ? [{ ...e.areas[0], intensity: pain }] : e.areas
  await db.entries.update(id, {
    readings: { ...e.readings, [PAIN]: pain },
    areas,
    history: [...(e.history ?? []), { at, pain }],
    updatedAt: now(),
  })
  return db.entries.get(id)
}

export function activeEpisodes(): Promise<Entry[]> {
  return db.entries.filter((e) => e.ongoing).sortBy('at')
}

export async function lastEntry(): Promise<Entry | undefined> {
  return db.entries.orderBy('createdAt').last()
}

/** Clone an entry as a new one happening now. */
export async function repeatEntry(source: Entry): Promise<Entry> {
  return addEntry({
    readings: source.readings,
    areas: source.areas,
    tags: source.tags,
    ongoing: source.ongoing,
    note: '',
  })
}

export function durationMs(entry: Entry, nowMs = Date.now()): number | null {
  if (!entry.ongoing && !entry.endedAt) return null
  const end = entry.endedAt ? Date.parse(entry.endedAt) : nowMs
  return Math.max(0, end - Date.parse(entry.at))
}
