import { summarizeRegions } from './regions'

/** Human summary of a region list, e.g. "fianchi, gambe". `t` is the i18n lookup. */
export function regionText(regions: string[], t: (k: string) => string): string {
  return summarizeRegions(regions)
    .map((s) => {
      if (s.group === 'full') return t('region.full')
      if (s.group === 'head' || s.group === 'torso' || s.group === 'back') return t(`region.${s.group}`)
      return t(`region.${s.group}.${s.side === 'none' ? 'both' : s.side}`)
    })
    .join(', ')
}
