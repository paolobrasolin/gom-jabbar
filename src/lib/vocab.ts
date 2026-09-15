import { db } from './db'
import { PAIN, type Entry, type Symptom, type Tag, type TagGroup, type Lang } from './types'

type Table = 'symptoms' | 'tags'

function slug(text: string): string {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return (base || 'item') + '_' + Math.random().toString(36).slice(2, 6)
}

export async function addSymptom(text: string): Promise<Symptom> {
  const last = await db.symptoms.orderBy('order').last()
  const s: Symptom = { id: slug(text), label: { it: text, en: text }, enabled: true, order: (last?.order ?? -1) + 1 }
  await db.symptoms.add(s)
  return s
}

export async function addTag(text: string, group: TagGroup): Promise<Tag> {
  const last = await db.tags.orderBy('order').last()
  const t: Tag = { id: slug(text), label: { it: text, en: text }, group, enabled: true, order: (last?.order ?? -1) + 1 }
  await db.tags.add(t)
  return t
}

export async function rename(table: Table, id: string, lang: Lang, text: string): Promise<void> {
  const item = await db[table].get(id)
  if (!item) return
  const label = { ...item.label, [lang]: text }
  // Items whose two labels were identical are user-made or untranslated: keep them in sync.
  if (item.label.it === item.label.en) label.it = label.en = text
  await db[table].update(id, { label })
}

export async function setEnabled(table: Table, id: string, enabled: boolean): Promise<void> {
  if (table === 'symptoms' && id === PAIN) return
  await db[table].update(id, { enabled })
}

/** Swap order with the previous or next item in the same list (tags: same group). */
export async function move(table: Table, id: string, dir: -1 | 1): Promise<void> {
  const all = (await db[table].orderBy('order').toArray()) as (Symptom | Tag)[]
  const me = all.find((x) => x.id === id)
  if (!me) return
  const list = table === 'tags' ? all.filter((x) => (x as Tag).group === (me as Tag).group) : all
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
 * The tags to offer without opening anything: the most used first (count over `entries`, ties in
 * vocabulary order), then the first enabled tags in vocabulary order to fill `n` slots.
 * `selected` tags (the draft's) that did not make the cut are appended, so what was picked from
 * the full list stays visible and can be toggled off from the strip. Appended, not moved to the
 * front: the strip must not reorder under a finger that just tapped it.
 */
export function frequentTags(entries: Entry[], tags: Tag[], n = 6, selected: string[] = []): Tag[] {
  const enabled = tags.filter((t) => t.enabled)
  const byId = new Map(enabled.map((t) => [t.id, t]))
  const count = new Map<string, number>()
  for (const e of entries) for (const id of e.tags) if (byId.has(id)) count.set(id, (count.get(id) ?? 0) + 1)
  const ranked = [...enabled].sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0))
  const out = ranked.slice(0, n)
  const seen = new Set(out.map((t) => t.id))
  for (const id of selected) {
    const t = byId.get(id)
    if (t && !seen.has(id)) {
      seen.add(id)
      out.push(t)
    }
  }
  return out
}
