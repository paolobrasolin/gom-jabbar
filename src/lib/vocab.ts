import { nanoid } from 'nanoid'
import { db } from './db'
import type { Entry, Preset, Symptom, SymptomCategory, Tag, TagGroup } from './types'
import { I18N, isMindSymptom } from './vocabulary'
import { mergedTags } from './layers'

type Table = 'symptoms' | 'tags'

/** A typed name as stored (§5.2): trimmed, never a dictionary key. Empty when nothing is left. */
function cleanName(text: string): string {
  let s = text.trim()
  while (s.startsWith(I18N)) s = s.slice(I18N.length).trim()
  return s
}

/** A new item: a random id (a name in it would outlive a rename) and the name as typed. */
export async function addSymptom(text: string, category: SymptomCategory = 'body'): Promise<Symptom> {
  const last = await db.symptoms.orderBy('order').last()
  const s: Symptom = { id: nanoid(), label: cleanName(text), category, enabled: true, order: (last?.order ?? -1) + 1 }
  await db.symptoms.add(s)
  return s
}

export async function addTag(text: string, group: TagGroup): Promise<Tag> {
  const last = await db.tags.orderBy('order').last()
  const t: Tag = { id: nanoid(), label: cleanName(text), group, enabled: true, order: (last?.order ?? -1) + 1 }
  await db.tags.add(t)
  return t
}

/** The typed word replaces the name, in every language (§5.2); a blank one leaves the item as it was. */
export async function rename(table: Table, id: string, text: string): Promise<void> {
  const label = cleanName(text)
  if (label) await db[table].update(id, { label })
}

export async function setEnabled(table: Table, id: string, enabled: boolean): Promise<void> {
  await db[table].update(id, { enabled })
}

/** Swap order with the previous or next item in the same list (tags: same group; symptoms: same category). */
export async function move(table: Table, id: string, dir: -1 | 1): Promise<void> {
  const all = (await db[table].orderBy('order').toArray()) as (Symptom | Tag)[]
  const me = all.find((x) => x.id === id)
  if (!me) return
  const list =
    table === 'tags'
      ? all.filter((x) => (x as Tag).group === (me as Tag).group)
      : all.filter((x) => isMindSymptom(x as Symptom) === isMindSymptom(me as Symptom))
  const i = list.indexOf(me)
  const j = i + dir
  if (j < 0 || j >= list.length) return
  const other = list[j]
  await db.transaction('rw', db[table], async () => {
    await db[table].update(me.id, { order: other.order })
    await db[table].update(other.id, { order: me.order })
  })
}

/**
 * Every enabled tag, the most used first (count over `entries`, ties in vocabulary order).
 * The strip shows all of them in one scrolling row: what gets used sits under the thumb,
 * the long tail is a swipe away, and the grouped view exists only for browsing by category.
 */
export function frequentTags(entries: Entry[], tags: Tag[]): Tag[] {
  const enabled = tags.filter((t) => t.enabled)
  const ids = new Set(enabled.map((t) => t.id))
  const count = new Map<string, number>()
  for (const e of entries) for (const id of mergedTags(e.layers)) if (ids.has(id)) count.set(id, (count.get(id) ?? 0) + 1)
  return [...enabled].sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0))
}

export type Usage = { entries: number; presets: number }

/**
 * How much each symptom and tag is used (§5.2): the entries reading the symptom or carrying the tag on any layer, and
 * the presets asking for the symptom. An id missing from the map is unused.
 */
export function usage(entries: Entry[], presets: Preset[]): Map<string, Usage> {
  const out = new Map<string, Usage>()
  const bump = (id: string, k: keyof Usage) => {
    const u = out.get(id) ?? { entries: 0, presets: 0 }
    u[k]++
    out.set(id, u)
  }
  for (const e of entries) {
    const ids = new Set([...e.layers.flatMap((l) => Object.keys(l.readings)), ...mergedTags(e.layers)])
    for (const id of ids) bump(id, 'entries')
  }
  for (const p of presets) for (const id of new Set(p.layers.flatMap((l) => l.asks ?? []))) bump(id, 'presets')
  return out
}

/** Delete an unused item (§5.2), checked in the same transaction; the row comes back for the undo toast. */
export async function deleteItem(table: Table, id: string): Promise<Symptom | Tag | undefined> {
  return db.transaction('rw', db[table], db.entries, db.presets, async () => {
    const item = await db[table].get(id)
    if (!item) return undefined
    const used = usage(await db.entries.toArray(), await db.presets.toArray()).has(id)
    if (used) return undefined
    await db[table].delete(id)
    return item
  })
}

/** Undo of a deletion: the row as it was, same id and order. */
export async function restoreItem(table: Table, item: Symptom | Tag): Promise<void> {
  await (db[table] as typeof db.tags).put(item as Tag)
}
