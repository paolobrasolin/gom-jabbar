import Dexie, { type EntityTable } from 'dexie'
import type { Entry, Preset, Symptom, Tag } from './types'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from './vocabulary'
import { upgradeRegions } from './regions'
import type { Area } from './areas'

export class GomJabbarDB extends Dexie {
  entries!: EntityTable<Entry, 'id'>
  symptoms!: EntityTable<Symptom, 'id'>
  tags!: EntityTable<Tag, 'id'>
  presets!: EntityTable<Preset, 'id'>

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
    // 4: presets table; entries gain an optional `preset` id, indexed for the "last value" lookup.
    this.version(4).stores({
      entries: 'id, at, createdAt, updatedAt, preset',
      presets: 'id, order',
    })
    // 5: region ids became CHOIR-based codes (§5.3); every area in entries and presets is converted.
    this.version(5)
      .stores({})
      .upgrade(async (tx) => {
        const convert = (row: { areas?: Area[] }) => {
          if (Array.isArray(row.areas)) row.areas = row.areas.map((a) => ({ ...a, regions: upgradeRegions(a.regions) }))
        }
        await tx.table('entries').toCollection().modify(convert)
        await tx.table('presets').toCollection().modify(convert)
      })
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
