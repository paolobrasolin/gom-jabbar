import { PAIN, type Entry } from './types'
import type { Area } from './areas'
import type { EntryInput } from './entries'

/** Form state for creating or editing an entry. `at: null` means "now, resolved at save". */
export type EntryDraft = {
  at: string | null
  ongoing: boolean
  /** Pain brush / overall level when there are no areas. Per-area levels live in `areas`. */
  readings: Record<string, number>
  areas: Area[]
  /** Index of the area the slider edits. */
  cur: number
  tags: string[]
  note: string
}

export function emptyDraft(opts: { ongoing?: boolean; pain?: number } = {}): EntryDraft {
  return {
    at: null,
    ongoing: opts.ongoing ?? false,
    readings: { [PAIN]: opts.pain ?? 5 },
    areas: [],
    cur: 0,
    tags: [],
    note: '',
  }
}

export function draftFromEntry(e: Entry): EntryDraft {
  return {
    at: e.at,
    ongoing: e.ongoing,
    readings: { [PAIN]: 0, ...e.readings },
    areas: e.areas.map((a) => ({ ...a, regions: [...a.regions] })),
    cur: 0,
    tags: [...e.tags],
    note: e.note,
  }
}

export function draftToInput(d: EntryDraft): EntryInput {
  return {
    at: d.at ?? new Date().toISOString(),
    ongoing: d.ongoing,
    readings: { ...d.readings },
    areas: d.areas.map((a) => ({ ...a, regions: [...a.regions] })),
    tags: [...d.tags],
    note: d.note.trim(),
  }
}

/** How many optional details are set: readings other than pain above 0, tags, and a non-blank note. */
export function detailCount(d: EntryDraft): number {
  const readings = Object.entries(d.readings).filter(([id, v]) => id !== PAIN && v > 0).length
  return readings + d.tags.length + (d.note.trim() ? 1 : 0)
}
