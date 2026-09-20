import { summarizeRegions } from './regions'
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

/** An entry's headline reading: the highest one. Pain wins ties and stands in when nothing is set. */
export function headline(readings: Record<string, number>): Headline {
  let best: Headline = { id: PAIN, value: readings[PAIN] ?? 0 }
  for (const [id, v] of Object.entries(readings)) if (id !== PAIN && v > best.value) best = { id, value: v }
  return best
}

/** Lowercase name of a symptom for a headline, e.g. "gonfiore"; empty for pain, which needs no naming. */
export function symptomName(id: string, symptoms: Symptom[], tl: (s: LocalizedString) => string): string {
  if (id === PAIN) return ''
  const def = symptoms.find((s) => s.id === id)
  return def ? tl(def.label).toLowerCase() : id
}

/** One symptom's levels through an episode's history, e.g. [7, 4, 2]. Points without it are skipped. */
export function trail(e: Entry, id: string): number[] {
  return (e.history ?? []).map((h) => h.readings[id]).filter((v): v is number => typeof v === 'number')
}
