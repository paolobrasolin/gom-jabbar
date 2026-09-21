import type { Layer, Stroke } from './layers'

export type { Layer, Stroke }
export type SymptomId = string
export type TagId = string
export type RegionId = string

export type LocalizedString = { it: string; en: string }
export type Lang = keyof LocalizedString

/** Two kinds of thing (§5.1): a chronic snapshot, how it is at one time; an episode, a chain of readings with a start and an end. */
export type EntryKind = 'chronic' | 'episode'

/**
 * One reading at one time: the only place readings live. An episode is a chain of them: the head, the reading
 * it started with, carries the end; the updates that follow point at the head (§5.5).
 */
export type Entry = {
  id: string
  kind: EntryKind
  /** ISO datetime: a chronic snapshot's reference time; an episode reading's time, the head's being the start. */
  at: string
  /** What and where, as independent layers (§5.4). Never empty: an entry with no location is one layer without regions. */
  layers: Layer[]
  note: string
  /** Episode only: the head's id. The head is the entry whose `episodeId` is its own id. */
  episodeId?: string
  /** Head only: when the episode ended; null while it is active. */
  endedAt?: string | null
  /** The preset this entry was logged from, if any (§5.6); an update inherits its head's. */
  presetId?: string
  createdAt: string
  updatedAt: string
}

/** Where a symptom lives: on the body (the pain slider and its siblings) or in the head (§5.2). */
export type SymptomCategory = 'body' | 'mind'

export type Symptom = {
  id: SymptomId
  label: LocalizedString
  category: SymptomCategory
  enabled: boolean
  order: number
}

export type TagGroup = 'intervention' | 'context' | 'medication'

export type Tag = {
  id: TagId
  label: LocalizedString
  group: TagGroup
  enabled: boolean
  order: number
}

/** A named, saved shape of an entry: tap it, set the level(s), save. Each save logs a chronic snapshot or opens an episode. */
export type Preset = {
  id: string
  name: string
  /** The layers as captured: regions, tags and paint matter, the readings are set at each save. */
  layers: Layer[]
  /** Sliders the preset sheet shows, in order. */
  symptomIds: SymptomId[]
  /** What a save logs (§5.6). */
  kind: EntryKind
  order: number
}

export const PAIN = 'pain'
