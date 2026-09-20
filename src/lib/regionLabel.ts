import { REGION_BY_ID } from './regions'

type T = (k: string, p?: Record<string, string | number>) => string

/** Human name for a region id, e.g. "Coscia sx" / "Left thigh". */
export function regionLabel(id: string, t: T): string {
  const def = REGION_BY_ID[id]
  if (!def) return id
  const name = t(`reg.${def.name}`)
  return t('reg.sideFmt', { name, side: t(def.side === 'l' ? 'reg.left' : 'reg.right') })
}
