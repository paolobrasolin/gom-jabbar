import type { Symptom, SymptomCategory, Tag } from './types'

/** The prefix of a label read from the dictionaries (§5.2); anything else is shown as typed. */
export const I18N = 'i18n:'
const seed = (id: string) => `${I18N}vocab.${id}`

/** The category a symptom gets when its row has none (rows written before version 6): fog is mind, the rest body. */
export function defaultCategory(id: string): SymptomCategory {
  return id === 'fog' ? 'mind' : 'body'
}

export const isMindSymptom = (s: Symptom): boolean => (s.category ?? defaultCategory(s.id)) === 'mind'

/**
 * The first enabled symptom of a kind, in vocabulary order: a layer's headline slider (§6.1). Pain is only the seed's
 * first body symptom (#36): switched off, moved or deleted, the next one leads.
 */
export function firstEnabled(symptoms: Symptom[], category: SymptomCategory): Symptom | undefined {
  return [...symptoms].sort((a, b) => a.order - b.order).find((s) => s.enabled && (s.category ?? defaultCategory(s.id)) === category)
}

/** The lead symptom (#36): the body's first enabled one, which wins headline ties and goes unnamed (§5.1). Pain in the seed. */
export const leadSymptom = (symptoms: Symptom[]): string | undefined => firstEnabled(symptoms, 'body')?.id

/** The seed (§5.2): what a fresh database starts with, and what Cancella tutto brings back. Ids are user data: entries store them. */
export const DEFAULT_SYMPTOMS: Symptom[] = [
  { id: 'pain', label: seed('pain'), category: 'body', enabled: true, order: 0 },
  { id: 'swelling', label: seed('swelling'), category: 'body', enabled: true, order: 1 },
  { id: 'heaviness', label: seed('heaviness'), category: 'body', enabled: true, order: 2 },
  { id: 'fatigue', label: seed('fatigue'), category: 'body', enabled: true, order: 3 },
  { id: 'fog', label: seed('fog'), category: 'mind', enabled: true, order: 4 },
  { id: 'tenderness', label: seed('tenderness'), category: 'body', enabled: true, order: 5 },
  { id: 'stiffness', label: seed('stiffness'), category: 'body', enabled: true, order: 6 },
  { id: 'anxiety', label: seed('anxiety'), category: 'mind', enabled: true, order: 7 },
  { id: 'depression', label: seed('depression'), category: 'mind', enabled: true, order: 8 },
]

export const DEFAULT_TAGS: Tag[] = [
  { id: 'compression', group: 'intervention', label: seed('compression'), enabled: true, order: 0 },
  { id: 'mld', group: 'intervention', label: seed('mld'), enabled: true, order: 1 },
  { id: 'exercise', group: 'intervention', label: seed('exercise'), enabled: true, order: 2 },
  { id: 'rest', group: 'intervention', label: seed('rest'), enabled: true, order: 3 },
  { id: 'heat', group: 'intervention', label: seed('heat'), enabled: true, order: 4 },
  { id: 'cold', group: 'intervention', label: seed('cold'), enabled: true, order: 5 },
  { id: 'stretching', group: 'intervention', label: seed('stretching'), enabled: true, order: 6 },
  { id: 'meditation', group: 'intervention', label: seed('meditation'), enabled: true, order: 7 },
  { id: 'period', group: 'context', label: seed('period'), enabled: true, order: 10 },
  { id: 'stress', group: 'context', label: seed('stress'), enabled: true, order: 11 },
  { id: 'badsleep', group: 'context', label: seed('badsleep'), enabled: true, order: 12 },
  { id: 'standing', group: 'context', label: seed('standing'), enabled: true, order: 13 },
  { id: 'sitting', group: 'context', label: seed('sitting'), enabled: true, order: 14 },
  { id: 'hot_weather', group: 'context', label: seed('hot_weather'), enabled: true, order: 15 },
  // Added after 0.9.6: a fresh database (or Cancella tutto) starts with it; an existing one gets it from the editor.
  { id: 'cold_weather', group: 'context', label: seed('cold_weather'), enabled: true, order: 16 },
  { id: 'travel', group: 'context', label: seed('travel'), enabled: true, order: 17 },
]
