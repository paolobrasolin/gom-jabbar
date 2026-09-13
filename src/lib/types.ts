import type { Area } from './areas'

export type { Area }
export type SymptomId = string
export type TagId = string
export type RegionId = string

export type LocalizedString = { it: string; en: string }
export type Lang = keyof LocalizedString

export type Entry = {
  id: string
  /** ISO datetime: when it happened, or when the episode started. */
  at: string
  /** ISO datetime: when the episode ended, if it was one. */
  endedAt: string | null
  /** True while an episode is active. */
  ongoing: boolean
  /** Symptom scores 0..10. Always has at least one key. `pain` is the max over areas when any exist. */
  readings: Record<SymptomId, number>
  /** Painful areas, each with its own intensity. [] = unspecified. An area with regions ['*'] is full body. */
  areas: Area[]
  /** Intensity updates made while an episode was ongoing. The entry's own `at`/pain is the implicit first point. */
  history?: { at: string; pain: number }[]
  tags: TagId[]
  note: string
  createdAt: string
  updatedAt: string
}

export type Symptom = {
  id: SymptomId
  label: LocalizedString
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

export const PAIN: SymptomId = 'pain'
