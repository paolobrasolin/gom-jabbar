import Dexie from 'dexie'
import { GomJabbarDB } from '../lib/db'

/** Opens database `name` as a release one version ahead of this code would (#113): today's stores and one more. */
export async function openNewer(name: string): Promise<Dexie> {
  const now = new GomJabbarDB(name)
  const stores = Object.fromEntries(now.tables.map((t) => [t.name, [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(', ')]))
  const d = new Dexie(name)
  d.version(now.verno + 1).stores({ ...stores, extra: 'id' })
  await d.open()
  return d
}
