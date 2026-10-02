import { nanoid } from 'nanoid'
import { db } from './db'
import { finalize, newLayer, type Layer, type Stroke } from './layers'
import type { Entry, EntryKind, Symptom } from './types'
import { entryHeadline } from './summary'

export type LayerInput = { regions?: string[]; readings?: Record<string, number>; tags?: string[]; strokes?: Stroke[] }

/** `readings` and `tags` without `layers` are a shorthand for one layer without regions. */
export type EntryInput = {
  at?: string
  /** Chronic unless said otherwise. */
  kind?: EntryKind
  /** Episode only: an end makes it over from the start; null or missing leaves it active. */
  endedAt?: string | null
  layers?: LayerInput[]
  readings?: Record<string, number>
  tags?: string[]
  note?: string
  presetId?: string
}

const now = () => new Date().toISOString()

const toLayer = (l: LayerInput): Layer => ({ regions: l.regions ?? [], readings: { ...(l.readings ?? {}) }, tags: [...(l.tags ?? [])], ...(l.strokes ? { strokes: l.strokes } : {}) })

/** An entry as it will be stored. With the vocabulary given, each layer keeps only the readings its regions show (§6.1). */
export function makeEntry(input: EntryInput, symptoms?: Symptom[]): Entry {
  const ts = now()
  const raw = input.layers ? input.layers.map(toLayer) : [{ ...newLayer(input.readings ?? {}), tags: [...(input.tags ?? [])] }]
  const layers = finalize(raw.length ? raw : [newLayer()], symptoms)
  const id = nanoid()
  const kind = input.kind ?? 'chronic'
  return {
    id,
    kind,
    at: input.at ?? ts,
    layers,
    note: input.note ?? '',
    ...(kind === 'episode' ? { episodeId: id, endedAt: input.endedAt ?? null } : {}),
    ...(input.presetId ? { presetId: input.presetId } : {}),
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

/** An edit from the form (§6.2): the row as it was comes back with the saved one, for the undo toast. */
export function editEntry(id: string, patch: Partial<Omit<Entry, 'id' | 'createdAt'>>): Promise<{ before?: Entry; after?: Entry }> {
  return db.transaction('rw', db.entries, db.symptoms, async () => {
    const before = await db.entries.get(id)
    if (!before) return { before: undefined, after: undefined }
    return { before, after: await updateEntry(id, patch) }
  })
}

/** The head of an episode: the reading it started with, carrying its end (§5.5). */
export const isHead = (e: Entry): boolean => e.kind === 'episode' && e.episodeId === e.id
/** A later reading of an episode. */
export const isUpdate = (e: Entry): boolean => e.kind === 'episode' && !!e.episodeId && e.episodeId !== e.id
/** A head whose episode has not ended. */
export const isActive = (e: Entry): boolean => isHead(e) && !e.endedAt

/** An episode as a whole: the head and its updates in time order. */
export type Episode = { head: Entry; updates: Entry[] }

/** The most recent reading of an episode: what the card and the sheet show. */
export const latest = (ep: Episode): Entry => ep.updates[ep.updates.length - 1] ?? ep.head

/**
 * The reading an episode is shown by (§5.5): while it goes on, the latest, how it is now; once it has ended, its worst,
 * the reading with the highest headline (the later of equals), so a migraine that peaked at 8 is not shown at the 2 it
 * ended on.
 */
export function shownReading(ep: Episode): Entry {
  if (!ep.head.endedAt) return latest(ep)
  return [ep.head, ...ep.updates].reduce((best, e) => (entryHeadline(e).value >= entryHeadline(best).value ? e : best))
}

/** The n of an update split from a version 7 history (§8), id `<head id>:<n>`; null for any other id. */
function pointNumber(e: Entry): number | null {
  const m = e.id.startsWith(`${e.episodeId}:`) ? /^\d+$/.exec(e.id.slice(e.episodeId!.length + 1)) : null
  return m ? Number(m[0]) : null
}

/**
 * Updates in time order. Readings at the same time (possible in split histories) go by their point's number, then by
 * when they were written, then by id: as text, `h:10` came before `h:2`, and an older reading could show as the latest (#115).
 */
function byTime(a: Entry, b: Entry): number {
  const na = pointNumber(a)
  const nb = pointNumber(b)
  return a.at.localeCompare(b.at) || (na !== null && nb !== null ? na - nb : 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

/** Every episode among `entries`, by head id: updates whose head is not among them are left out. */
export function episodesOf(entries: Entry[]): Map<string, Episode> {
  const out = new Map<string, Episode>()
  for (const e of entries) if (isHead(e)) out.set(e.id, { head: e, updates: [] })
  for (const e of entries) if (isUpdate(e)) out.get(e.episodeId!)?.updates.push(e)
  for (const ep of out.values()) ep.updates.sort(byTime)
  return out
}

/** The head and every update of an episode, head first, updates in time order. */
export async function loadEpisode(headId: string): Promise<Episode | undefined> {
  const rows = await db.entries.where('episodeId').equals(headId).toArray()
  return episodesOf(rows).get(headId)
}

/** Deleting a head takes its whole chain along. Returns every row removed, for undo. */
export async function deleteEntry(id: string): Promise<Entry[]> {
  const entry = await db.entries.get(id)
  if (!entry) return []
  const rows = isHead(entry) ? await db.entries.where('episodeId').equals(id).toArray() : [entry]
  await db.entries.bulkDelete(rows.map((r) => r.id))
  return rows
}

export async function restoreEntries(rows: Entry[]): Promise<void> {
  await db.entries.bulkPut(rows)
}

/** Tags per layer, aligned with the entry's layers; a missing list is no tags. */
export type LayerTags = (string[] | undefined)[]

function withTags(layers: Layer[], tags: LayerTags): Layer[] {
  return layers.map((l, i) => ({ ...l, tags: [...(tags[i] ?? [])] }))
}

/** End an episode: its head gets the end. */
export async function endEpisode(id: string, at: string = now()): Promise<Entry | undefined> {
  const e = await db.entries.get(id)
  if (!e || !isHead(e)) return undefined
  return updateEntry(id, { endedAt: at })
}

export async function reopenEpisode(id: string): Promise<Entry | undefined> {
  const e = await db.entries.get(id)
  if (!e || !isHead(e)) return undefined
  return updateEntry(id, { endedAt: null })
}

/**
 * Log a new reading on an episode (§5.5): an update from where it stands, one record of readings per layer over the
 * latest reading's (unmentioned symptoms and layers keep their levels), the tags given replacing that layer's.
 */
export async function logUpdate(headId: string, readings: (Record<string, number> | undefined)[], at: string = now(), tags?: LayerTags, note = ''): Promise<Entry | undefined> {
  const ep = await loadEpisode(headId)
  if (!ep) return undefined
  const from = latest(ep)
  const layers = withTags(
    // Every reading the latest had stays on its layer, at the level the sheet set: the sheet shows them all.
    from.layers.map((l, i) => {
      const next = { ...l.readings, ...(readings[i] ?? {}) }
      return { ...l, readings: next, had: { regions: l.regions, readings: Object.fromEntries(Object.keys(l.readings).map((id) => [id, next[id]])) } }
    }),
    // Nothing is carried but the levels and the places: tags are what was done now, or the episode's own context (§5.5).
    tags ?? [],
  )
  const ts = now()
  const entry: Entry = { id: nanoid(), kind: 'episode', episodeId: headId, at, layers: finalize(layers, await db.symptoms.toArray()), note: note.trim(), createdAt: ts, updatedAt: ts }
  await db.entries.add(entry)
  return entry
}

/**
 * What an episode's row shows (§5.5): the layers of the reading it is shown by (`shownReading`: the latest while it goes
 * on, the worst once ended, so the numbers agree with the pill, #114), with every tag of the episode once, in the order
 * first met, on the first layer. Updates copy no tags, so the start's context and each dose appear here and nowhere twice.
 */
export function chainLayers(ep: Episode): Layer[] {
  const cur = shownReading(ep).layers
  const all = [...new Set([ep.head, ...ep.updates].flatMap((e) => e.layers.flatMap((l) => l.tags)))]
  return cur.map((l, i) => ({ ...l, tags: i === 0 ? all : [] }))
}

/** Why an entry's times cannot be saved (§5.5): an end before its start; a reading outside its episode. */
export type TimeProblem = 'end-before-start' | 'before-start' | 'after-update'
/**
 * `notBefore` is the head's start, for an update; `notAfter` the first update, for a head that has one. Equal times
 * are fine: a reading at the very moment the episode started, an end at its start.
 */
export function timeProblem(e: { at: string; endedAt?: string | null }, bounds: { notBefore?: string; notAfter?: string } = {}): TimeProblem | null {
  // To the minute, as the chips and the picker work: "Adesso" as the end and as the start is the same moment.
  const t = (iso: string) => Math.floor(Date.parse(iso) / 60_000)
  if (e.endedAt && t(e.endedAt) < t(e.at)) return 'end-before-start'
  if (bounds.notBefore && t(e.at) < t(bounds.notBefore)) return 'before-start'
  if (bounds.notAfter && t(e.at) > t(bounds.notAfter)) return 'after-update'
  return null
}

/** Active episodes, oldest first, each with its updates. */
export function activeEpisodes(): Promise<Episode[]> {
  // One read transaction: a chain deleted between reading the heads and loading them is never half seen.
  return db.transaction('r', db.entries, async () => {
    const heads = await db.entries.filter(isActive).sortBy('at')
    const out: Episode[] = []
    for (const h of heads) out.push((await loadEpisode(h.id))!)
    return out
  })
}

/** How long an episode has lasted (heads only): until its end, or now. */
export function durationMs(entry: Entry, nowMs = Date.now()): number | null {
  if (!isHead(entry)) return null
  const end = entry.endedAt ? Date.parse(entry.endedAt) : nowMs
  return Math.max(0, end - Date.parse(entry.at))
}
