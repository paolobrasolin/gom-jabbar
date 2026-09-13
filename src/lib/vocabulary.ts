import type { Symptom, Tag } from './types'

export const DEFAULT_SYMPTOMS: Symptom[] = [
  { id: 'pain', label: { it: 'Dolore', en: 'Pain' }, enabled: true, order: 0 },
  { id: 'swelling', label: { it: 'Gonfiore', en: 'Swelling' }, enabled: true, order: 1 },
  { id: 'heaviness', label: { it: 'Pesantezza', en: 'Heaviness' }, enabled: true, order: 2 },
  { id: 'fatigue', label: { it: 'Stanchezza', en: 'Fatigue' }, enabled: true, order: 3 },
  { id: 'fog', label: { it: 'Nebbia mentale', en: 'Brain fog' }, enabled: true, order: 4 },
  { id: 'tenderness', label: { it: 'Dolorabilità al tatto', en: 'Tenderness' }, enabled: true, order: 5 },
  { id: 'stiffness', label: { it: 'Rigidità', en: 'Stiffness' }, enabled: true, order: 6 },
]

export const DEFAULT_TAGS: Tag[] = [
  { id: 'compression', group: 'intervention', label: { it: 'Compressione', en: 'Compression' }, enabled: true, order: 0 },
  { id: 'mld', group: 'intervention', label: { it: 'Linfodrenaggio', en: 'Lymphatic drainage' }, enabled: true, order: 1 },
  { id: 'exercise', group: 'intervention', label: { it: 'Movimento', en: 'Exercise' }, enabled: true, order: 2 },
  { id: 'rest', group: 'intervention', label: { it: 'Riposo', en: 'Rest' }, enabled: true, order: 3 },
  { id: 'heat', group: 'intervention', label: { it: 'Calore', en: 'Heat' }, enabled: true, order: 4 },
  { id: 'cold', group: 'intervention', label: { it: 'Freddo', en: 'Cold' }, enabled: true, order: 5 },
  { id: 'period', group: 'context', label: { it: 'Ciclo', en: 'Period' }, enabled: true, order: 10 },
  { id: 'stress', group: 'context', label: { it: 'Stress', en: 'Stress' }, enabled: true, order: 11 },
  { id: 'badsleep', group: 'context', label: { it: 'Dormito male', en: 'Slept badly' }, enabled: true, order: 12 },
  { id: 'standing', group: 'context', label: { it: 'In piedi a lungo', en: 'Standing long' }, enabled: true, order: 13 },
  { id: 'sitting', group: 'context', label: { it: 'Seduta a lungo', en: 'Sitting long' }, enabled: true, order: 14 },
  { id: 'hot_weather', group: 'context', label: { it: 'Caldo', en: 'Hot weather' }, enabled: true, order: 15 },
  { id: 'travel', group: 'context', label: { it: 'Viaggio', en: 'Travel' }, enabled: true, order: 16 },
]
