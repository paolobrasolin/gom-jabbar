import { db } from './db'
import type { EntryDraft } from './draft'
import type { EntryInput } from './entries'

/**
 * The log's draft, mirrored to storage on every change (§6.1): a trip through ☰ unmounts the log, a reload or the
 * round trip to Google's consent screen starts the page again, and Android may kill the app in the background. None
 * of them may lose what was being entered. Local storage, not session storage: only it survives a kill and a relaunch
 * from the icon. `resetAll` forgets it with every other `gj.*` key.
 */
export const DRAFT_KEY = 'gj.draft'
/** Bump when `EntryDraft` changes shape: a draft stored by another build is dropped, never guessed at. */
export const DRAFT_SCHEMA = 1
/**
 * The oldest database version whose drafts this code reads: a draft written just before a release reaches the release
 * (#113). Bump it when an upgrade changes what a draft refers to (region, symptom, tag or preset ids).
 */
export const DRAFT_SINCE = 10
/** A draft older than this is not brought back: half a day later it is not what is being entered any more. */
export const DRAFT_TTL = 12 * 3_600_000

type Stored = { schema: number; verno: number; savedAt: number; draft: EntryDraft }

export function storeDraft(d: EntryDraft, now = Date.now()): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ schema: DRAFT_SCHEMA, verno: db.verno, savedAt: now, draft: d } satisfies Stored))
  } catch {
    /* storage unavailable or full: the draft lives only in memory, as before */
  }
}

/**
 * The stored draft, or null: none, too old, of another shape, from a database version before `DRAFT_SINCE` (an upgrade
 * changed the ids it refers to) or after this code's (a newer copy wrote it).
 */
export function loadDraft(now = Date.now()): EntryDraft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Partial<Stored> | null
    const d = raw?.draft
    if (raw?.schema !== DRAFT_SCHEMA || typeof raw.verno !== 'number' || raw.verno < DRAFT_SINCE || raw.verno > db.verno || typeof raw.savedAt !== 'number' || now - raw.savedAt > DRAFT_TTL) return null
    if (!d || !Array.isArray(d.layers) || !d.layers.length || typeof d.cur !== 'number') return null
    return d
  } catch {
    return null
  }
}

/**
 * What a kept draft may refer to that is gone by the time it is saved (a tag or a symptom deleted, a preset deleted or
 * replaced by a restore) is dropped, never stored as a dangling id.
 */
export async function pruneUnknown(input: EntryInput): Promise<EntryInput> {
  const [tags, symptoms, preset] = await Promise.all([
    db.tags.toCollection().primaryKeys(),
    db.symptoms.toCollection().primaryKeys(),
    input.presetId ? db.presets.get(input.presetId) : undefined,
  ])
  const tagIds = new Set<string>(tags as string[])
  const symptomIds = new Set<string>(symptoms as string[])
  return {
    ...input,
    ...(input.presetId !== undefined ? { presetId: preset ? input.presetId : undefined } : {}),
    layers: input.layers?.map((l) => ({
      ...l,
      readings: Object.fromEntries(Object.entries(l.readings ?? {}).filter(([id]) => symptomIds.has(id))),
      tags: (l.tags ?? []).filter((id) => tagIds.has(id)),
    })),
  }
}
