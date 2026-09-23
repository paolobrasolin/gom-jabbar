import Dexie, { type EntityTable } from 'dexie'
import type { Entry, Preset, Symptom, Tag } from './types'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS, MIND_DEFAULTS_V6, defaultCategory } from './vocabulary'
import { upgradeRegions } from './regions'
import { entryToLayers, presetToLayers, categoryLookup, splitEpisode, presetKind, presetAsks, type AreaV6, type EntryV6, type EntryV7, type PresetV6, type PresetV7, type PresetV8 } from './legacy'

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
        tx.table('entries').toCollection().modify((e: { areas?: AreaV6[]; regions?: string[]; readings?: Record<string, number> }) => {
          if (!e.areas) e.areas = e.regions?.length ? [{ regions: e.regions, intensity: e.readings?.pain ?? 0 }] : []
          delete e.regions
        }),
      )
    // 3: history points `{ at, pain }` became `{ at, readings: { pain } }` so an episode can track every symptom.
    this.version(3)
      .stores({})
      .upgrade((tx) =>
        tx.table('entries').toCollection().modify((e: { history?: { at: string; pain?: number; readings?: Record<string, number> }[] }) => {
          if (!Array.isArray(e.history)) return
          e.history = e.history.map((h) => {
            const { pain, ...rest } = h
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
        const convert = (row: { areas?: AreaV6[] }) => {
          if (Array.isArray(row.areas)) row.areas = row.areas.map((a) => ({ ...a, regions: upgradeRegions(a.regions) }))
        }
        await tx.table('entries').toCollection().modify(convert)
        await tx.table('presets').toCollection().modify(convert)
      })
    // 6: symptoms gain a category (§5.2): fog is a mind symptom, everything else body, unless the row already says.
    // The mind defaults that came with this version are added when their ids are free; nothing is touched otherwise.
    this.version(6)
      .stores({})
      .upgrade(async (tx) => {
        const symptoms = tx.table('symptoms')
        await symptoms.toCollection().modify((s: Symptom) => {
          if (!s.category) s.category = defaultCategory(s.id)
        })
        const have = new Set((await symptoms.toArray()).map((s: Symptom) => s.id))
        await symptoms.bulkAdd(MIND_DEFAULTS_V6.filter((s) => !have.has(s.id)))
      })
    // 7: areas became layers (§5.4, §8): each with its own readings and tags. An entry's readings and tags are
    // placed on its layers by symptom category, nothing dropped; presets likewise. The mind's own level goes: it was derived.
    this.version(7)
      .stores({})
      .upgrade(async (tx) => {
        const categoryOf = categoryLookup(await tx.table('symptoms').toArray())
        await tx.table('entries').toCollection().modify((e: Record<string, unknown>) => {
          const old = e as unknown as Partial<EntryV6>
          const { layers, history } = entryToLayers({ areas: old.areas ?? [], readings: old.readings ?? {}, tags: old.tags ?? [], history: old.history }, categoryOf)
          e.layers = layers
          if (history) e.history = history
          delete e.areas
          delete e.readings
          delete e.tags
        })
        await tx.table('presets').toCollection().modify((p: Record<string, unknown>) => {
          const old = p as unknown as Partial<PresetV6>
          p.layers = presetToLayers({ areas: old.areas ?? [], tags: old.tags ?? [] })
          delete p.areas
          delete p.tags
        })
      })
    // 8: an episode is a chain of readings (§5.5, §8): the row becomes the head, its history points become updates
    // pointing at it, `kind` names what a row is, `preset` becomes `presetId`; `ongoing` and `history` go once replaced.
    // Presets: `ongoing` becomes `kind`. Nothing is cleared: heads are rewritten in place, updates added beside them.
    this.version(8)
      .stores({
        entries: 'id, at, createdAt, updatedAt, presetId, episodeId',
        presets: 'id, order',
      })
      .upgrade(async (tx) => {
        const entries = tx.table('entries')
        const updates: Entry[] = []
        await entries.toCollection().modify((row: Record<string, unknown>) => {
          const [head, ...rest] = splitEpisode(row as unknown as EntryV7)
          updates.push(...rest)
          for (const k of Object.keys(row)) delete row[k]
          Object.assign(row, head)
        })
        await entries.bulkAdd(updates)
        await tx.table('presets').toCollection().modify((row: Record<string, unknown>) => {
          const next = presetKind(row as PresetV7)
          for (const k of Object.keys(row)) delete row[k]
          Object.assign(row, next)
        })
      })
    // 9: a preset's `symptomIds` become `asks` on each of its layers (§5.6): the old list kept to what that layer shows
    // by symptom category; a preset without layers gets one unlocated layer asking the whole list. `symptomIds` goes
    // once replaced; a layer's readings and tags stay, unread. Entries are untouched.
    this.version(9)
      .stores({})
      .upgrade(async (tx) => {
        const categoryOf = categoryLookup(await tx.table('symptoms').toArray())
        await tx.table('presets').toCollection().modify((row: Record<string, unknown>) => {
          const next = presetAsks(row as PresetV8, categoryOf)
          for (const k of Object.keys(row)) delete row[k]
          Object.assign(row, next)
        })
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
