import { REGION_BY_ID } from './regions'

type T = (k: string, p?: Record<string, string | number>) => string

/** Human name for a region id, e.g. "Coscia sx" / "Left thigh". */
export function regionLabel(id: string, t: T): string {
  const def = REGION_BY_ID[id]
  const base = def?.side ? id.slice(0, -2) : id
  const name = t(`reg.${base}`)
  if (!def?.side) return name
  return t('reg.sideFmt', { name, side: t(def.side === 'l' ? 'reg.left' : 'reg.right') })
}
