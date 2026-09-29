import { REGION_BY_ID, MIND } from './regions'

type T = (k: string, p?: Record<string, string | number>) => string

/** Human name for a region id, the part it shows with its side (#33), e.g. "Coscia sx" / "Back of left knee". */
export function regionLabel(id: string, t: T): string {
  if (id === MIND) return t('reg.mind')
  const def = REGION_BY_ID[id]
  if (!def) return id
  const name = t(`part.${def.word}.${def.side}`)
  return name.charAt(0).toUpperCase() + name.slice(1)
}
