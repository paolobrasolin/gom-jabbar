import { ANATOMY, type Node } from './anatomy'
import { isUpdate } from './entries'
import { mergedReadings, mergedTags } from './layers'
import { FULL_BODY, MIND, REGION_BY_ID } from './regions'
import type { Entry, Label, Preset, Symptom, Tag } from './types'

type T = (k: string, p?: Record<string, string | number>) => string

/** The vocabulary a reading is found through, disabled items included: history keeps them. `tl` and `t` speak the current language. */
export type SearchContext = { tags: Tag[]; symptoms: Symptom[]; presets: Preset[]; tl: (l: Label) => string; t: T }

/** Lowercase, without accents: "Perché" and "perche" are the same word to a search. */
export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** The words of a text, folded: runs of letters and digits, so "l'ufficio" holds "ufficio". */
export const words = (text: string): string[] => fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** Each region name's words of the anatomy (#33), from its area down to its own: the knee's back is "leg", "knee", "kneeBack". */
const PATHS = new Map<string, string[]>()
const walk = (n: Node, above: string[]) => {
  const path = [...above, n.word]
  if (n.children) n.children.forEach((c) => walk(c, path))
  else PATHS.set(n.names[0], path)
}
ANATOMY.forEach((a) => walk(a, []))
const ALL_WORDS = [...new Set([...PATHS.values()].flat())]

/**
 * What a reading can be found by, as phrases of folded words: its note, its tags, its preset (a head's or a chronic
 * entry's: an update would find every episode of the preset again), its symptoms above 0, and for each region every word
 * of the anatomy covering it, on its side ("ginocchio sx", "gamba sx") and on both ("ginocchia", "gambe"). Full body is
 * its own words, not every region's: a day of pain everywhere is not what a search for the knee is after.
 */
function build(e: Entry, ctx: SearchContext): string[][] {
  const { t, tl } = ctx
  const readings = mergedReadings(e.layers)
  const tags = mergedTags(e.layers).map((id) => ctx.tags.find((x) => x.id === id)).filter((x): x is Tag => !!x)
  const preset = e.presetId && !isUpdate(e) ? ctx.presets.find((p) => p.id === e.presetId)?.name : undefined
  const texts = [e.note, preset ?? '', ...tags.map((x) => tl(x.label)), ...ctx.symptoms.filter((s) => (readings[s.id] ?? 0) > 0).map((s) => tl(s.label))]
  const keys = new Set<string>()
  for (const id of e.layers.flatMap((l) => l.regions)) {
    if (id === FULL_BODY) keys.add('region.full')
    else if (id === MIND) keys.add('region.mind')
    else if (REGION_BY_ID[id]) for (const w of PATHS.get(REGION_BY_ID[id].name)!) keys.add(`part.${w}.${REGION_BY_ID[id].side}`).add(`part.${w}.both`)
  }
  return [...texts, ...[...keys].map((k) => t(k))].map(words).filter((p) => p.length)
}

/**
 * Read off the anatomy's own phrases: the words that say a side ("sx", "dx" in Italian, "left", "right" in English) and
 * the words that say a place ("ginocchio", "gambe", "dietro"), which a side binds to.
 */
function buildWords(t: T): Vocab {
  const sides = new Set<string>()
  const all = new Set<string>()
  for (const w of ALL_WORDS) {
    const l = words(t(`part.${w}.l`))
    const r = words(t(`part.${w}.r`))
    for (const x of l) if (!r.includes(x)) sides.add(x)
    for (const x of r) if (!l.includes(x)) sides.add(x)
    for (const x of [...l, ...r, ...words(t(`part.${w}.both`))]) all.add(x)
  }
  return { sides, places: [...all].filter((x) => !sides.has(x)), skip: new Set(words(t('diary.searchSkip'))) }
}
/** `skip`: the words a search passes over while others remain, articles and prepositions ("all'anca"), "mal" ("mal di testa"). */
type Vocab = { sides: Set<string>; places: string[]; skip: Set<string> }

/** Built once per vocabulary and reading: the Diary's live queries hand out new objects only when a row changes. */
const phrases = new WeakMap<SearchContext, WeakMap<Entry, string[][]>>()
const vocabs = new WeakMap<SearchContext, Vocab>()

function phrasesOf(e: Entry, ctx: SearchContext): string[][] {
  let byEntry = phrases.get(ctx)
  if (!byEntry) phrases.set(ctx, (byEntry = new WeakMap()))
  let ps = byEntry.get(e)
  if (!ps) byEntry.set(e, (ps = build(e, ctx)))
  return ps
}
function vocabOf(ctx: SearchContext): Vocab {
  let v = vocabs.get(ctx)
  if (!v) vocabs.set(ctx, (v = buildWords(ctx.t)))
  return v
}

const starts = (p: string[], w: string) => p.some((x) => x.startsWith(w))

/**
 * Every typed word must start a word of the reading. A side binds to the places typed next to it: "ginocchio sx" needs
 * one phrase holding both, so a right knee and a left hand is not a hit. A side with no place next to it ("sx" alone,
 * "dolore sx") is any side. Articles, prepositions and "mal" are skipped while other words remain: "mal di testa" is "testa".
 */
export function matches(e: Entry, query: string, ctx: SearchContext): boolean {
  const { sides: side, places, skip } = vocabOf(ctx)
  const typed = words(query)
  if (!typed.length) return true
  const kept = typed.filter((w) => !skip.has(w))
  const ws = kept.length ? kept : typed
  const ps = phrasesOf(e, ctx)
  return ws.every((w, i) => {
    const near = [ws[i - 1], ws[i + 1]].filter((n) => n !== undefined && !side.has(n) && places.some((p) => p.startsWith(n)))
    if (!side.has(w) || !near.length) return ps.some((p) => starts(p, w))
    return ps.some((p) => starts(p, w) && near.some((n) => starts(p, n)))
  })
}

/** The matching readings, newest first: updates are readings like any other (§6.2). */
export function search(entries: Entry[], query: string, ctx: SearchContext): Entry[] {
  return entries.filter((e) => matches(e, query, ctx)).sort((a, b) => b.at.localeCompare(a.at))
}

const LEAD = 20

/** A long note from the word before the first match, so the match shows in a one-line preview. */
export function snippet(note: string, query: string): string {
  // Fold one character at a time, keeping where each folded character came from.
  let folded = ''
  const from: number[] = []
  let i = 0
  for (const ch of note) {
    const f = fold(ch)
    folded += f
    for (let k = 0; k < f.length; k++) from.push(i)
    i += ch.length
  }
  // A word is letters and digits only (`words`): nothing in it needs escaping.
  const hits = words(query).map((w) => folded.search(new RegExp(`(?<![\\p{L}\\p{N}])${w}`, 'u'))).filter((n) => n >= 0)
  if (!hits.length) return note
  const at = from[Math.min(...hits)]
  if (at <= LEAD) return note
  const space = note.indexOf(' ', at - LEAD)
  return `…${note.slice(space + 1)}`
}
