import type { Layer, Stroke } from './layers'

export type { Layer, Stroke }
export type SymptomId = string
export type TagId = string
export type RegionId = string

export type LocalizedString = { it: string; en: string }
export type Lang = keyof LocalizedString

/** Readings at one moment of an episode, one record per layer, aligned with `entry.layers` (§5.5). */
export type HistoryPoint = { at: string; layers: Record<SymptomId, number>[] }

export type Entry = {
  id: string
  /** ISO datetime: when it happened, or when the episode started. */
  at: string
  /** ISO datetime: when the episode ended, if it was one. */
  endedAt: string | null
  /** True while an episode is active. */
  ongoing: boolean
  /** What and where, as independent layers (§5.4). Never empty: an entry with no location is one layer without regions. */
  layers: Layer[]
  /** Readings over time while an episode was ongoing: the starting point first, then one per update. */
  history?: HistoryPoint[]
  /** The preset this moment was logged from, if any (§5.6). */
  preset?: string
  note: string
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

/** A named, saved shape of an entry: tap it, set the level(s), save. Each tap logs an ordinary moment. */
export type Preset = {
  id: string
  name: string
  /** The layers as captured: regions, tags and paint matter, the readings are set at each save. */
  layers: Layer[]
  /** Sliders the preset sheet shows, in order. */
  symptomIds: SymptomId[]
  ongoing: boolean
  order: number
}

export const PAIN = 'pain'
