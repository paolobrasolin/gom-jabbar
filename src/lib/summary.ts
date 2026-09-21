import { summarizeRegions } from './regions'
import { mergedReadings, maxReadings } from './layers'
import { PAIN, type Entry, type LocalizedString, type Symptom } from './types'

/** Human summary of a region list, e.g. "fianchi, gambe". `t` is the i18n lookup. */
export function regionText(regions: string[], t: (k: string) => string): string {
  return summarizeRegions(regions)
    .map((s) => {
      if (s.group === 'full') return t('region.full')
      if (s.group === 'mind') return t('region.mind')
      if (s.group === 'head' || s.group === 'torso' || s.group === 'back') return t(`region.${s.group}`)
      return t(`region.${s.group}.${s.side === 'none' ? 'both' : s.side}`)
    })
    .join(', ')
}

export type Headline = { id: string; value: number }

/** A headline reading: the highest one. Pain wins ties and stands in when nothing is set. */
export function headline(readings: Record<string, number>): Headline {
  let best: Headline = { id: PAIN, value: readings[PAIN] ?? 0 }
  for (const [id, v] of Object.entries(readings)) if (id !== PAIN && v > best.value) best = { id, value: v }
  return best
}

/** An entry's headline: over the readings of all its layers (§5.1). */
export const entryHeadline = (e: { layers: { readings: Record<string, number> }[] }): Headline => headline(mergedReadings(e.layers))

/** The level a layer is shown at: its headline value. */
export const layerLevel = (l: { readings: Record<string, number> }): number => headline(l.readings).value

/** Lowercase name of a symptom for a headline, e.g. "gonfiore"; empty for pain, which needs no naming. */
export function symptomName(id: string, symptoms: Symptom[], tl: (s: LocalizedString) => string): string {
  if (id === PAIN) return ''
  const def = symptoms.find((s) => s.id === id)
  return def ? tl(def.label).toLowerCase() : id
}

/** One symptom's levels through an episode's history, e.g. [7, 4, 2]: the max over the layers at each point; points without it are skipped. */
export function trail(e: Entry, id: string): number[] {
  return (e.history ?? []).map((h) => maxReadings(h.layers)[id]).filter((v): v is number => typeof v === 'number')
}
