import { db } from './db'
import { takeSnapshot, type Snapshot } from './snapshots'
import type { Entry, Preset, Symptom, Tag } from './types'
import type { Layer } from './layers'
import { isHead } from './entries'
import { entryToLayers, presetToLayers, categoryLookup, categoryV5, seedSymptomsV10, seedTagsV10, PAIN_V1, splitEpisode, presetKind, presetAsks, oneLabel, type AreaV6, type CategoryOf, type EntryV7, type HistoryPoint, type PresetV7, type PresetV8 } from './legacy'
import { upgradeRegions } from './regions'

export const EXPORT_VERSION = 10

/**
 * The export version whose rows each database version stores (§8). Equal up to 10; a version that changes only the
 * database (a table, an index) maps to the export version before it. Every database version has one: a test says so.
 */
export const EXPORT_OF_DATABASE: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 10 }

export type ExportFile = {
  app: 'gom-jabbar'
  version: number
  exportedAt: string
  vocabulary: { symptoms: Symptom[]; tags: Tag[] }
  entries: Entry[]
  /** Since version 4. */
  presets: Preset[]
}

/**
 * Every row, sorted as the indexes would sort them, ties by id and a row lacking the key last: `orderBy` would skip
 * such a row, and a backup is the one place nothing may be missing.
 */
function sortedBy<T extends { id: string }>(rows: T[], key: (r: T) => string | number | undefined): T[] {
  const rank = (r: T) => key(r) ?? null
  return rows.sort((a, b) => {
    const x = rank(a)
    const y = rank(b)
    if (x !== y) return x === null ? 1 : y === null ? -1 : x < y ? -1 : 1
    // Ids are unique: two rows never tie here.
    return a.id < b.id ? -1 : 1
  })
}

export async function buildExport(): Promise<ExportFile> {
  const [symptoms, tags, entries, presets] = await db.transaction('r', db.symptoms, db.tags, db.entries, db.presets, () =>
    Promise.all([db.symptoms.toArray(), db.tags.toArray(), db.entries.toArray(), db.presets.toArray()]),
  )
  return exportOf({ symptoms, tags, entries, presets })
}

/** The four tables as a backup file of `version` (§8): rows sorted, nothing else touched. Snapshots are made the same way. */
export function exportOf(
  rows: { symptoms: Symptom[]; tags: Tag[]; entries: Entry[]; presets: Preset[] },
  version = EXPORT_VERSION,
  exportedAt = new Date().toISOString(),
): ExportFile {
  const { symptoms, tags, entries, presets } = rows
  sortedBy(symptoms, (r) => r.order)
  sortedBy(tags, (r) => r.order)
  sortedBy(entries, (r) => r.at)
  sortedBy(presets, (r) => r.order)
  return { app: 'gom-jabbar', version, exportedAt, vocabulary: { symptoms, tags }, entries, presets }
}

export function exportFilename(kind: 'json' | 'html', d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `gom-jabbar-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.${kind}`
}

/** Parse and validate an export file. Accepts every version ever written and upgrades it. Throws on garbage. */
export function parseImport(text: string): ExportFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('invalid-json')
  }
  if (!raw || typeof raw !== 'object') throw new Error('invalid-file')
  const o = raw as Record<string, unknown>
  if (o.app !== 'gom-jabbar' || !Array.isArray(o.entries)) throw new Error('invalid-file')
  const version = typeof o.version === 'number' ? o.version : 1
  // A file from a newer app (a rollback): its shape is unknown here, so nothing of it is read.
  if (version > EXPORT_VERSION) throw new Error('newer-version')
  const vocab = (o.vocabulary ?? {}) as Partial<ExportFile['vocabulary']>
  // A file without a vocabulary (no version ever wrote one) reads as carrying the seed as of version 10, frozen (#113);
  // an empty one stays empty (§8).
  const symptoms = Array.isArray(vocab.symptoms) ? vocab.symptoms.map((s) => normalizeSymptom(s, version)) : seedSymptomsV10()
  const tags = Array.isArray(vocab.tags) ? vocab.tags.map((x) => normalizeTag(x, version)) : seedTagsV10()
  const categoryOf = categoryLookup(symptoms)
  const entries = (o.entries as Row[]).flatMap((e) => normalizeEntry(e, version, categoryOf))
  return {
    app: 'gom-jabbar',
    version: EXPORT_VERSION,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : new Date().toISOString(),
    vocabulary: { symptoms, tags },
    entries,
    presets: Array.isArray(o.presets) ? (o.presets as Row[]).map((p) => normalizePreset(p, version, categoryOf)) : [],
  }
}

/**
 * Before version 7 a preset had `areas` and `tags`; they became layers (converted, never dropped). Before version 8
 * `ongoing` said what a save logged; it became `kind`. Before version 9 `symptomIds` was one list for every layer;
 * it became `asks` on each layer (§5.6).
 */
function normalizePreset(p: Row, version: number, categoryOf: CategoryOf): Preset {
  let out = p
  if (version < 7) {
    const areas = version < 5 ? upgradeAreas(p.areas as AreaV6[]) : (p.areas as AreaV6[])
    const { areas: _a, tags: _t, ...rest } = p
    out = { ...rest, layers: presetToLayers({ areas: areas ?? [], tags: (p.tags as string[]) ?? [] }) }
  }
  if (version < 8) out = presetKind(out as PresetV7)
  if (version < 9) out = presetAsks(out as PresetV8, categoryOf)
  else if (!Array.isArray(p.layers) || !p.layers.every(isPresetLayer)) throw new Error('invalid-preset')
  return out as Preset
}

type Row = Record<string, unknown>

const isObject = (x: unknown): x is Row => !!x && typeof x === 'object' && !Array.isArray(x)
const isStrings = (x: unknown): boolean => Array.isArray(x) && x.every((v) => typeof v === 'string')
/** A layer as written since version 7: regions, readings as numbers, tags; anything else on it passes untouched. */
const isLayer = (l: unknown): boolean =>
  isObject(l) && isStrings(l.regions) && isObject(l.readings) && Object.values(l.readings).every((v) => typeof v === 'number') && isStrings(l.tags)
/** A preset layer as written since version 9: a where and what it asks. */
const isPresetLayer = (l: unknown): boolean => isObject(l) && isStrings(l.regions) && isStrings(l.asks)

/**
 * Before version 6 a symptom had no category; it gets the default for its id (fog mind, the rest body). Before version
 * 10 its label held both languages; it becomes one string (§5.2). Nothing else is touched.
 */
function normalizeSymptom(s: Symptom, version: number): Symptom {
  const out = s.category ? s : { ...s, category: categoryV5(s.id) }
  return version < 10 ? { ...out, label: oneLabel('symptoms', s.id, s.label) } : out
}

/** Before version 10 a tag's label held both languages; it becomes one string (§5.2). Nothing else is touched. */
function normalizeTag(t: Tag, version: number): Tag {
  return version < 10 ? { ...t, label: oneLabel('tags', t.id, t.label) } : t
}

type PointV6 = { at: string; readings: Record<string, number> }

/** Before version 3 a history point carried a single `pain` value; it became `readings` (converted, never dropped). */
function normalizePoint(h: Row, version: number): PointV6 {
  if (version < 3 && !h.readings && typeof h.pain === 'number') {
    const { pain, ...rest } = h
    return { ...rest, readings: { [PAIN_V1]: pain } } as unknown as PointV6
  }
  return h as PointV6
}

/** Before version 5 regions were named ids, some unsided; they became codes (§5.3), converted, never dropped. */
const upgradeAreas = (areas: AreaV6[]): AreaV6[] => (Array.isArray(areas) ? areas.map((a) => ({ ...a, regions: upgradeRegions(a.regions) })) : areas)

/**
 * Before version 7 an entry had `readings`, `areas` and `tags` once; they became layers (§8), placed by
 * symptom category, nothing dropped. The steps of the versions before are applied first, in order.
 */
function layersOf(e: Row, version: number, categoryOf: CategoryOf): { layers: Layer[]; history?: HistoryPoint[] } {
  if (version >= 7) {
    // Every version from 7 on wrote at least one well-formed layer: anything else is a damaged file, not a reading.
    if (!Array.isArray(e.layers) || !e.layers.length || !e.layers.every(isLayer)) throw new Error('invalid-entry')
    return { layers: e.layers as Layer[], history: Array.isArray(e.history) ? (e.history as HistoryPoint[]) : undefined }
  }
  const readings = (e.readings && typeof e.readings === 'object' ? e.readings : { [PAIN_V1]: 0 }) as Record<string, number>
  let areas: AreaV6[] = Array.isArray(e.areas) ? (e.areas as AreaV6[]) : []
  if (version < 2 && Array.isArray(e.regions) && (e.regions as string[]).length) {
    areas = [{ regions: e.regions as string[], intensity: readings[PAIN_V1] ?? 0 }]
  }
  if (version < 5) areas = upgradeAreas(areas)
  const history = Array.isArray(e.history) ? (e.history as Row[]).map((h) => normalizePoint(h, version)) : undefined
  return entryToLayers({ areas, readings, tags: Array.isArray(e.tags) ? (e.tags as string[]) : [], history }, categoryOf)
}

/**
 * An entry of any version as today's rows. Before version 8 an episode was one row with a history; it becomes a
 * chain, so one row may come back as several (§8).
 */
function normalizeEntry(e: Row, version: number, categoryOf: CategoryOf): Entry[] {
  if (typeof e.id !== 'string' || typeof e.at !== 'string') throw new Error('invalid-entry')
  const { layers, history } = layersOf(e, version, categoryOf)
  const ts = typeof e.updatedAt === 'string' ? e.updatedAt : e.at
  // Spread first: a field this version does not know about is still the user's data and must survive.
  const base = {
    ...(e as object),
    id: e.id,
    at: e.at,
    layers,
    note: typeof e.note === 'string' ? e.note : '',
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : e.at,
    updatedAt: ts,
  }
  // Only a converted field may be dropped: `regions` became `areas` (2), `readings`, `areas` and `tags` became `layers` (7),
  // `ongoing`, `history` and `preset` became the chain (8).
  const o = base as Record<string, unknown>
  if (version < 2) delete o.regions
  if (version < 7) {
    delete o.readings
    delete o.areas
    delete o.tags
  }
  if (version < 8) {
    return splitEpisode({ ...o, endedAt: typeof e.endedAt === 'string' ? e.endedAt : null, ongoing: e.ongoing === true, history } as EntryV7)
  }
  const episode = e.kind === 'episode' || typeof e.episodeId === 'string' || e.endedAt !== undefined
  const out: Entry = { ...(o as unknown as Entry), kind: episode ? 'episode' : 'chronic' }
  if (episode) {
    out.episodeId = typeof e.episodeId === 'string' ? e.episodeId : e.id
    if (out.episodeId === e.id) out.endedAt = typeof e.endedAt === 'string' ? e.endedAt : null
  }
  return [out]
}

export type ImportPreview = { entries: number; added: number; updated: number; unchanged: number; symptoms: number; tags: number }

export async function previewImport(file: ExportFile): Promise<ImportPreview> {
  const existing = new Map((await db.entries.toArray()).map((e) => [e.id, e]))
  let added = 0
  let updated = 0
  let unchanged = 0
  for (const e of file.entries) {
    const cur = existing.get(e.id)
    if (!cur) added++
    else if (e.updatedAt > cur.updatedAt) updated++
    else unchanged++
  }
  return { entries: file.entries.length, added, updated, unchanged, symptoms: file.vocabulary.symptoms.length, tags: file.vocabulary.tags.length }
}

export type ImportMode = 'merge' | 'replace'

/**
 * Merge: upsert by id, newer `updatedAt` wins; vocabulary items are added if missing. Replace: wipe and load. Either
 * first keeps the diary as it stands as a copy (`copy`, §4.1), in the same transaction: no copy, nothing applied.
 */
export async function applyImport(file: ExportFile, mode: ImportMode): Promise<ImportPreview & { copy: Snapshot }> {
  const preview = await previewImport(file)
  let copy!: Snapshot
  await db.transaction('rw', [db.entries, db.symptoms, db.tags, db.presets, db.snapshots], async () => {
    copy = await takeSnapshot(mode)
    if (mode === 'replace') {
      await Promise.all([db.entries.clear(), db.symptoms.clear(), db.tags.clear(), db.presets.clear()])
      await db.entries.bulkPut(file.entries)
      await db.presets.bulkPut(file.presets)
      // An empty vocabulary is one that was emptied on purpose (§5.2): it stays empty.
      await db.symptoms.bulkPut(file.vocabulary.symptoms)
      await db.tags.bulkPut(file.vocabulary.tags)
      return
    }
    const existing = new Map((await db.entries.toArray()).map((e) => [e.id, e]))
    const newer = file.entries.filter((e) => {
      const cur = existing.get(e.id)
      return !cur || e.updatedAt > cur.updatedAt
    })
    // Two histories can disagree on what a row is: a newer copy of an episode's start may be chronic in the file while
    // updates here still point at it. Its content wins, its place in the chain stays, so no update is orphaned (§8).
    const merged = new Map([...existing, ...newer.map((e) => [e.id, e] as const)])
    const pointedAt = new Set([...merged.values()].filter((e) => e.episodeId && e.episodeId !== e.id).map((e) => e.episodeId!))
    const toPut = newer.map((e) => {
      const cur = existing.get(e.id)
      const keepsChain = cur && isHead(cur) && !isHead(e) && pointedAt.has(e.id)
      return keepsChain ? { ...e, kind: 'episode' as const, episodeId: e.id, endedAt: e.endedAt ?? cur.endedAt ?? null } : e
    })
    await db.entries.bulkPut(toPut)
    const haveS = new Set((await db.symptoms.toArray()).map((s) => s.id))
    await db.symptoms.bulkPut(file.vocabulary.symptoms.filter((s) => !haveS.has(s.id)))
    const haveT = new Set((await db.tags.toArray()).map((t) => t.id))
    await db.tags.bulkPut(file.vocabulary.tags.filter((t) => !haveT.has(t.id)))
    const haveP = new Set((await db.presets.toArray()).map((p) => p.id))
    await db.presets.bulkPut(file.presets.filter((p) => !haveP.has(p.id)))
  })
  return { ...preview, copy }
}

/**
 * Hand a text file to the OS share sheet, or download it when sharing files is not supported.
 * Chrome only shares an allowlist of types (.txt and .csv among them, not .json), so a JSON
 * backup is offered as .txt when that is the only way to reach the share sheet.
 */
export async function shareOrDownload(filename: string, text: string, mime: string): Promise<'shared' | 'downloaded'> {
  const file = new File([text], filename, { type: mime })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare) {
    const candidates = [file]
    if (mime === 'application/json') candidates.push(new File([text], filename.replace(/\.json$/, '') + '.txt', { type: 'text/plain' }))
    const shareable = candidates.find((f) => nav.canShare!({ files: [f] }))
    if (shareable) {
      try {
        await nav.share({ files: [shareable], title: filename })
        return 'shared'
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err
        // fall through to download
      }
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

const DAY = 86_400_000

/** How often the banner asks (§6.1), in days. Drive is one tap, so it asks more often. */
export const REMIND = { file: { every: 14, snooze: 7 }, drive: { every: 7, snooze: 3 } }

/**
 * Whether the log screen's banner asks for a backup, and in which words. Once Drive is in use on this device the
 * reminder is about Drive: a share-sheet backup does not stand in for it. `days` is how long since the last Drive
 * backup, when there was one. The oldest entry covers the never-backed-up case; no data, no banner.
 */
export function backupReminder(o: {
  lastBackupAt: string | null
  lastDriveAt: string | null
  drive: boolean
  oldestEntryAt: string | null
  snoozedUntil: string | null
  now: number
}): { drive: boolean; days: number | null } | null {
  if (!o.oldestEntryAt) return null
  if (o.snoozedUntil && Date.parse(o.snoozedUntil) > o.now) return null
  const last = o.drive ? o.lastDriveAt : o.lastBackupAt
  const since = o.now - Date.parse(last ?? o.oldestEntryAt)
  if (since <= REMIND[o.drive ? 'drive' : 'file'].every * DAY) return null
  return { drive: o.drive, days: o.drive && last ? Math.floor(since / DAY) : null }
}
