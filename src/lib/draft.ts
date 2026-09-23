import { PAIN, type Entry, type EntryKind } from './types'
import { newLayer, type Layer } from './layers'
import type { EntryInput } from './entries'

/** A deep enough copy: regions, tags, readings and strokes are the nested parts. */
export const copyLayers = (layers: Layer[]): Layer[] =>
  layers.map((l) => ({
    ...l,
    regions: [...l.regions],
    readings: { ...l.readings },
    tags: [...l.tags],
    ...(l.strokes ? { strokes: l.strokes.map((s) => ({ ...s, points: s.points.map(([x, y]) => [x, y] as [number, number]) })) } : {}),
  }))

/** Form state for creating or editing an entry. `at: null` means "now, resolved at save". */
export type EntryDraft = {
  at: string | null
  kind: EntryKind
  /** Episode only: its end, null while it is still going. Meaningless on a chronic draft. */
  endedAt: string | null
  /** Never empty: the form opens with one layer without regions (§6.1). */
  layers: Layer[]
  /** The layer the map, the sliders and the tag strip edit. */
  cur: number
  note: string
  /** The preset the entry will be logged under (§5.6): set when a preset was just named from this form. */
  presetId?: string
}

export function emptyDraft(opts: { kind?: EntryKind; pain?: number } = {}): EntryDraft {
  return {
    at: null,
    kind: opts.kind ?? 'chronic',
    endedAt: null,
    layers: [newLayer({ [PAIN]: opts.pain ?? 5 })],
    cur: 0,
    note: '',
  }
}

export function draftFromEntry(e: Entry): EntryDraft {
  return {
    at: e.at,
    kind: e.kind,
    endedAt: e.endedAt ?? null,
    layers: e.layers.length ? copyLayers(e.layers) : [newLayer({ [PAIN]: 0 })],
    cur: 0,
    note: e.note,
    ...(e.presetId ? { presetId: e.presetId } : {}),
  }
}

export function draftToInput(d: EntryDraft): EntryInput {
  return {
    at: d.at ?? new Date().toISOString(),
    kind: d.kind,
    endedAt: d.kind === 'episode' ? d.endedAt : null,
    layers: copyLayers(d.layers),
    note: d.note.trim(),
    ...(d.presetId ? { presetId: d.presetId } : {}),
  }
}
