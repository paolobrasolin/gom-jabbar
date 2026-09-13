import { db } from './db'
import { PAIN, type Entry, type Symptom, type Tag, type Lang } from './types'
import { regionText } from './summary'
import type { Area } from './areas'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from './vocabulary'

export const EXPORT_VERSION = 2

export type ExportFile = {
  app: 'gom-jabbar'
  version: number
  exportedAt: string
  vocabulary: { symptoms: Symptom[]; tags: Tag[] }
  entries: Entry[]
}

export async function buildExport(): Promise<ExportFile> {
  const [symptoms, tags, entries] = await Promise.all([
    db.symptoms.orderBy('order').toArray(),
    db.tags.orderBy('order').toArray(),
    db.entries.orderBy('at').toArray(),
  ])
  return { app: 'gom-jabbar', version: EXPORT_VERSION, exportedAt: new Date().toISOString(), vocabulary: { symptoms, tags }, entries }
}

export function exportFilename(kind: 'json' | 'csv', d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `gom-jabbar-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.${kind}`
}

/** Parse and validate an export file. Accepts version 1 (regions) and upgrades it. Throws on garbage. */
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
  const vocab = (o.vocabulary ?? {}) as Partial<ExportFile['vocabulary']>
  const entries = (o.entries as Record<string, unknown>[]).map((e) => normalizeEntry(e, version))
  return {
    app: 'gom-jabbar',
    version: EXPORT_VERSION,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : new Date().toISOString(),
    vocabulary: { symptoms: Array.isArray(vocab.symptoms) ? vocab.symptoms : [], tags: Array.isArray(vocab.tags) ? vocab.tags : [] },
    entries,
  }
}

function normalizeEntry(e: Record<string, unknown>, version: number): Entry {
  if (typeof e.id !== 'string' || typeof e.at !== 'string') throw new Error('invalid-entry')
  const readings = (e.readings && typeof e.readings === 'object' ? e.readings : { [PAIN]: 0 }) as Record<string, number>
  let areas: Area[] = Array.isArray(e.areas) ? (e.areas as Area[]) : []
  if (version < 2 && Array.isArray(e.regions) && (e.regions as string[]).length) {
    areas = [{ regions: e.regions as string[], intensity: readings[PAIN] ?? 0 }]
  }
  const ts = typeof e.updatedAt === 'string' ? e.updatedAt : e.at
  return {
    id: e.id,
    at: e.at,
    endedAt: typeof e.endedAt === 'string' ? e.endedAt : null,
    ongoing: e.ongoing === true,
    readings,
    areas,
    tags: Array.isArray(e.tags) ? (e.tags as string[]) : [],
    note: typeof e.note === 'string' ? e.note : '',
    history: Array.isArray(e.history) ? (e.history as Entry['history']) : undefined,
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : e.at,
    updatedAt: ts,
  }
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

/** Merge: upsert by id, newer `updatedAt` wins; vocabulary items are added if missing. Replace: wipe and load. */
export async function applyImport(file: ExportFile, mode: ImportMode): Promise<ImportPreview> {
  const preview = await previewImport(file)
  await db.transaction('rw', db.entries, db.symptoms, db.tags, async () => {
    if (mode === 'replace') {
      await Promise.all([db.entries.clear(), db.symptoms.clear(), db.tags.clear()])
      await db.entries.bulkPut(file.entries)
      // A file without vocabulary must not leave the app without symptoms or tags.
      await db.symptoms.bulkPut(file.vocabulary.symptoms.length ? file.vocabulary.symptoms : DEFAULT_SYMPTOMS)
      await db.tags.bulkPut(file.vocabulary.tags.length ? file.vocabulary.tags : DEFAULT_TAGS)
      return
    }
    const existing = new Map((await db.entries.toArray()).map((e) => [e.id, e]))
    const toPut = file.entries.filter((e) => {
      const cur = existing.get(e.id)
      return !cur || e.updatedAt > cur.updatedAt
    })
    await db.entries.bulkPut(toPut)
    const haveS = new Set((await db.symptoms.toArray()).map((s) => s.id))
    await db.symptoms.bulkPut(file.vocabulary.symptoms.filter((s) => !haveS.has(s.id)))
    const haveT = new Set((await db.tags.toArray()).map((t) => t.id))
    await db.tags.bulkPut(file.vocabulary.tags.filter((t) => !haveT.has(t.id)))
  })
  return preview
}

/** Flat CSV for spreadsheets. Not meant for reimport. */
export function toCsv(entries: Entry[], symptoms: Symptom[], tags: Tag[], lang: Lang, t: (k: string) => string): string {
  const symIds = [PAIN, ...symptoms.filter((s) => s.id !== PAIN).map((s) => s.id)]
  const tagLabel = new Map(tags.map((x) => [x.id, x.label[lang] || x.label.it]))
  const head = ['id', 'at', 'endedAt', 'ongoing', ...symIds, 'areas', 'areas_text', 'tags', 'tags_text', 'note', 'history']
  const rows = entries.map((e) => [
    e.id,
    e.at,
    e.endedAt ?? '',
    e.ongoing ? '1' : '0',
    ...symIds.map((id) => (e.readings[id] ?? '').toString()),
    e.areas.map((a) => `${a.regions.join('+')}:${a.intensity}`).join('|'),
    e.areas.map((a) => `${regionText(a.regions, t)}:${a.intensity}`).join('|'),
    e.tags.join('|'),
    e.tags.map((id) => tagLabel.get(id) ?? id).join('|'),
    e.note,
    (e.history ?? []).map((h) => `${h.at}:${h.pain}`).join('|'),
  ])
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)
  return [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
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

export const BACKUP_NUDGE_DAYS = 14

/** True when there is data and no backup for a while. `oldestEntryAt` covers the never-backed-up case. */
export function backupDue(lastBackupAt: string | null, oldestEntryAt: string | null, snoozedUntil: string | null, now = Date.now()): boolean {
  if (!oldestEntryAt) return false
  if (snoozedUntil && Date.parse(snoozedUntil) > now) return false
  const ref = lastBackupAt ?? oldestEntryAt
  return now - Date.parse(ref) > BACKUP_NUDGE_DAYS * 86_400_000
}
