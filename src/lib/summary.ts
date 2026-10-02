import { whereItems } from './anatomy'
import { mergedReadings, maxReadings } from './layers'
import { leadSymptom } from './vocabulary'
import type { Label, Symptom } from './types'

type T = (k: string, p?: Record<string, string | number>) => string

/** How many places a summary names before counting the rest (#33). */
const MAX_NAMES = 3

/** Human summary of a region list, e.g. "collo, spalle" or "gambe, schiena + 3". `t` is the i18n lookup. */
export function regionText(regions: string[], t: T): string {
  const names = whereItems(regions).map(({ word, side }) => (word === 'full' ? t('region.full') : word === 'mind' ? t('region.mind') : t(`part.${word}.${side}`)))
  if (names.length <= MAX_NAMES) return names.join(', ')
  return t('region.more', { list: names.slice(0, MAX_NAMES).join(', '), n: names.length - MAX_NAMES })
}

export type Headline = { id: string; value: number }

/**
 * A headline reading: the highest one. The lead symptom (`leadSymptom`) wins ties when it was read, and stands in when
 * nothing was (then shown as no level, `isRead`); a lone 0 of another symptom is that symptom's 0 (#114).
 */
export function headline(readings: Record<string, number>, lead = ''): Headline {
  let best: Headline | null = readings[lead] !== undefined ? { id: lead, value: readings[lead] } : null
  for (const [id, v] of Object.entries(readings)) if (id !== lead && (!best || v > best.value)) best = { id, value: v }
  return best ?? { id: lead, value: 0 }
}

/** Whether any layer holds a reading: one with none has no level to show, not a 0 (#114). */
export const isRead = (layers: { readings: Record<string, number> }[]): boolean => layers.some((l) => Object.keys(l.readings).length > 0)

/** An entry's headline: over the readings of all its layers (§5.1). */
export const entryHeadline = (e: { layers: { readings: Record<string, number> }[] }, lead?: string): Headline => headline(mergedReadings(e.layers), lead)

/** The level a layer is shown at: its headline value. */
export const layerLevel = (l: { readings: Record<string, number> }): number => headline(l.readings).value

/** Lowercase name of a symptom for a headline, e.g. "gonfiore"; empty for the lead symptom, which needs no naming. */
export function symptomName(id: string, symptoms: Symptom[], tl: (s: Label) => string): string {
  if (id === leadSymptom(symptoms)) return ''
  const def = symptoms.find((s) => s.id === id)
  return def ? tl(def.label).toLowerCase() : id
}

/** One symptom's levels through an episode's readings, e.g. [7, 4, 2]: the max over the layers of each; readings without it are skipped. */
export function trail(readings: { layers: { readings: Record<string, number> }[] }[], id: string): number[] {
  return readings.map((e) => maxReadings(e.layers.map((l) => l.readings))[id]).filter((v): v is number => typeof v === 'number')
}
