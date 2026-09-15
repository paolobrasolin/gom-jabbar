import Dexie, { type EntityTable } from 'dexie'
import type { Entry, Symptom, Tag } from './types'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from './vocabulary'

export class GomJabbarDB extends Dexie {
  entries!: EntityTable<Entry, 'id'>
  symptoms!: EntityTable<Symptom, 'id'>
  tags!: EntityTable<Tag, 'id'>

  constructor(name = 'gom-jabbar') {
    super(name)
    this.version(1).stores({
      entries: 'id, at, createdAt, updatedAt',
      symptoms: 'id, order',
      tags: 'id, group, order',
    })
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx.table('entries').toCollection().modify((e: Entry & { regions?: string[] }) => {
          if (!e.areas) e.areas = e.regions?.length ? [{ regions: e.regions, intensity: e.readings?.pain ?? 0 }] : []
          delete e.regions
        }),
      )
    // 3: history points `{ at, pain }` became `{ at, readings: { pain } }` so an episode can track every symptom.
    this.version(3)
      .stores({})
      .upgrade((tx) =>
        tx.table('entries').toCollection().modify((e: Entry) => {
          if (!Array.isArray(e.history)) return
          e.history = e.history.map((h) => {
            const { pain, ...rest } = h as unknown as { at: string; pain?: number; readings?: Record<string, number> }
            return rest.readings || pain === undefined ? h : { ...rest, readings: { pain } }
          })
        }),
      )
    this.on('populate', () => {
      this.symptoms.bulkAdd(DEFAULT_SYMPTOMS)
      this.tags.bulkAdd(DEFAULT_TAGS)
    })
  }
}

export let db = new GomJabbarDB()

/** Test helper: swap the global db for a fresh one. */
export function resetDb(name = 'gom-jabbar-test-' + Math.random().toString(36).slice(2)) {
  db = new GomJabbarDB(name)
  return db
}
