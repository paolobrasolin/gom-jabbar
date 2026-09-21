import type { Symptom, SymptomCategory, Tag } from './types'

/** The category a symptom gets when its row has none (rows written before version 6): fog is mind, the rest body. */
export function defaultCategory(id: string): SymptomCategory {
  return id === 'fog' ? 'mind' : 'body'
}

export const isMindSymptom = (s: Symptom): boolean => (s.category ?? defaultCategory(s.id)) === 'mind'

/** The highest mental reading, 0 when none is set: the level of an area holding only the mind (§5.4) and the mind's heat (§6.3). */
export function mindMax(readings: Record<string, number>, symptoms: Symptom[]): number {
  return Math.max(0, ...symptoms.filter(isMindSymptom).map((s) => readings[s.id] ?? 0))
}

export const DEFAULT_SYMPTOMS: Symptom[] = [
  { id: 'pain', label: { it: 'Dolore', en: 'Pain' }, category: 'body', enabled: true, order: 0 },
  { id: 'swelling', label: { it: 'Gonfiore', en: 'Swelling' }, category: 'body', enabled: true, order: 1 },
  { id: 'heaviness', label: { it: 'Pesantezza', en: 'Heaviness' }, category: 'body', enabled: true, order: 2 },
  { id: 'fatigue', label: { it: 'Stanchezza', en: 'Fatigue' }, category: 'body', enabled: true, order: 3 },
  { id: 'fog', label: { it: 'Nebbia mentale', en: 'Brain fog' }, category: 'mind', enabled: true, order: 4 },
  { id: 'tenderness', label: { it: 'Dolorabilità al tatto', en: 'Tenderness' }, category: 'body', enabled: true, order: 5 },
  { id: 'stiffness', label: { it: 'Rigidità', en: 'Stiffness' }, category: 'body', enabled: true, order: 6 },
  { id: 'anxiety', label: { it: 'Ansia', en: 'Anxiety' }, category: 'mind', enabled: true, order: 7 },
  { id: 'depression', label: { it: 'Depressione', en: 'Depression' }, category: 'mind', enabled: true, order: 8 },
]

/** Mind symptoms that arrived with version 6: a database upgraded from before gets them too, when their ids are free. */
export const MIND_DEFAULTS_V6 = DEFAULT_SYMPTOMS.filter((s) => s.id === 'anxiety' || s.id === 'depression')

export const DEFAULT_TAGS: Tag[] = [
  { id: 'compression', group: 'intervention', label: { it: 'Compressione', en: 'Compression' }, enabled: true, order: 0 },
  { id: 'mld', group: 'intervention', label: { it: 'Linfodrenaggio', en: 'Lymphatic drainage' }, enabled: true, order: 1 },
  { id: 'exercise', group: 'intervention', label: { it: 'Movimento', en: 'Exercise' }, enabled: true, order: 2 },
  { id: 'rest', group: 'intervention', label: { it: 'Riposo', en: 'Rest' }, enabled: true, order: 3 },
  { id: 'heat', group: 'intervention', label: { it: 'Calore', en: 'Heat' }, enabled: true, order: 4 },
  { id: 'cold', group: 'intervention', label: { it: 'Freddo', en: 'Cold' }, enabled: true, order: 5 },
  { id: 'stretching', group: 'intervention', label: { it: 'Stretching', en: 'Stretching' }, enabled: true, order: 6 },
  { id: 'meditation', group: 'intervention', label: { it: 'Meditazione', en: 'Meditation' }, enabled: true, order: 7 },
  { id: 'period', group: 'context', label: { it: 'Ciclo', en: 'Period' }, enabled: true, order: 10 },
  { id: 'stress', group: 'context', label: { it: 'Stress', en: 'Stress' }, enabled: true, order: 11 },
  { id: 'badsleep', group: 'context', label: { it: 'Dormito male', en: 'Slept badly' }, enabled: true, order: 12 },
  { id: 'standing', group: 'context', label: { it: 'In piedi a lungo', en: 'Standing long' }, enabled: true, order: 13 },
  { id: 'sitting', group: 'context', label: { it: 'Seduta a lungo', en: 'Sitting long' }, enabled: true, order: 14 },
  { id: 'hot_weather', group: 'context', label: { it: 'Caldo', en: 'Hot weather' }, enabled: true, order: 15 },
  { id: 'travel', group: 'context', label: { it: 'Viaggio', en: 'Travel' }, enabled: true, order: 16 },
]
