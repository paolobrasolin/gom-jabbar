import { PAIN, type Entry } from './types'
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
  ongoing: boolean
  /** Never empty: the form opens with one layer without regions (§6.1). */
  layers: Layer[]
  /** The layer the map, the sliders and the tag strip edit. */
  cur: number
  note: string
}

export function emptyDraft(opts: { ongoing?: boolean; pain?: number } = {}): EntryDraft {
  return {
    at: null,
    ongoing: opts.ongoing ?? false,
    layers: [newLayer({ [PAIN]: opts.pain ?? 5 })],
    cur: 0,
    note: '',
  }
}

export function draftFromEntry(e: Entry): EntryDraft {
  return {
    at: e.at,
    ongoing: e.ongoing,
    layers: e.layers.length ? copyLayers(e.layers) : [newLayer({ [PAIN]: 0 })],
    cur: 0,
    note: e.note,
  }
}

export function draftToInput(d: EntryDraft): EntryInput {
  return {
    at: d.at ?? new Date().toISOString(),
    ongoing: d.ongoing,
    layers: copyLayers(d.layers),
    note: d.note.trim(),
  }
}
