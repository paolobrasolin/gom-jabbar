import { REGION_BY_ID, MIND } from './regions'

type T = (k: string, p?: Record<string, string | number>) => string

/** Human name for a region id, e.g. "Coscia sx" / "Left thigh". */
export function regionLabel(id: string, t: T): string {
  if (id === MIND) return t('reg.mind')
  const def = REGION_BY_ID[id]
  if (!def) return id
  const name = t(`reg.${def.name}`)
  return t('reg.sideFmt', { name, side: t(def.side === 'l' ? 'reg.left' : 'reg.right') })
}
