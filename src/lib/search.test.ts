import { describe, it, expect, beforeEach } from 'vitest'
import { fold, words, matches, search, snippet, type SearchContext } from './search'
import { makeEntry } from './entries'
import { REGIONS, FULL_BODY, MIND } from './regions'
import { t, tl } from '../i18n/index.svelte'
import { prefs } from './prefs.svelte'
import type { Entry, Preset, Symptom, Tag } from './types'

beforeEach(() => {
  prefs.lang = 'it'
})

const tag = (id: string, label: string, group: Tag['group'], enabled = true): Tag => ({ id, label, group, enabled, order: 0 })
const TAGS: Tag[] = [tag('heat', 'i18n:vocab.heat', 'intervention'), tag('period', 'Ciclo', 'context'), tag('ibu', 'Ibuprofene', 'medication'), tag('old', 'Tachipirina', 'medication', false)]
const SYMPTOMS: Symptom[] = [
  { id: 'pain', label: 'i18n:vocab.pain', category: 'body', enabled: true, order: 0 },
  { id: 'fog', label: 'Nebbia mentale', category: 'mind', enabled: false, order: 1 },
]
const PRESETS: Preset[] = [{ id: 'p1', name: 'Emicrania', layers: [{ regions: [], asks: ['pain'] }], kind: 'episode', order: 0 }]
/** A fresh context per test: the words of a reading are cached per context, and the language changes between tests. */
const ctx = (): SearchContext => ({ tags: TAGS, symptoms: SYMPTOMS, presets: PRESETS, tl, t })

/** A region's id by segment name and side. */
const id = (name: string, side: 'l' | 'r') => REGIONS.find((r) => r.name === name && r.side === side)!.id

type Over = Partial<Entry> & { layers?: never; regions?: string[][]; readings?: Record<string, number>[]; tags?: string[][] }
const entry = ({ regions = [[]], readings = [{ pain: 3 }], tags = [[]], ...rest }: Over = {}): Entry => {
  const n = Math.max(regions.length, readings.length, tags.length)
  const e = makeEntry({ layers: Array.from({ length: n }, (_, i) => ({ regions: regions[i] ?? [], readings: readings[i] ?? {}, tags: tags[i] ?? [] })) })
  return { ...e, ...rest }
}
const hit = (e: Entry, q: string) => matches(e, q, ctx())

describe('fold and words', () => {
  it('ignores case and accents, and splits on anything but letters and digits', () => {
    expect(fold('Perché ÈCCO')).toBe('perche ecco')
    expect(words("  mal   di  Testa, l'ufficio ")).toEqual(['mal', 'di', 'testa', 'l', 'ufficio'])
    expect(words('')).toEqual([])
  })
})

describe('matches', () => {
  it('an empty search matches everything', () => {
    expect(hit(entry(), '')).toBe(true)
    expect(hit(entry(), '  ,  ')).toBe(true)
  })

  it('finds a word of the note, whatever the case and accents', () => {
    const e = entry({ note: 'Male dopo la corsa, perché ho esagerato' })
    expect(hit(e, 'CORSA')).toBe(true)
    expect(hit(e, 'perche')).toBe(true)
    expect(hit(e, 'nuoto')).toBe(false)
  })

  it('matches the start of words only', () => {
    const e = entry({ note: 'Riunione in ufficio' })
    expect(hit(e, 'uffic')).toBe(true)
    expect(hit(e, 'fficio')).toBe(false)
  })

  it('needs every word, on the same reading', () => {
    const e = entry({ note: 'corsa al parco', tags: [['ibu']] })
    expect(hit(e, 'corsa ibu')).toBe(true)
    expect(hit(e, 'corsa nuoto')).toBe(false)
  })

  it('finds tags on any layer by their label in the current language, disabled ones included', () => {
    const e = entry({ regions: [[id('knee', 'l')], [MIND]], tags: [['heat'], ['old']] })
    expect(hit(e, 'calore')).toBe(true)
    expect(hit(e, 'tachi')).toBe(true)
    expect(hit(e, 'ciclo')).toBe(false)
    prefs.lang = 'en'
    expect(hit(e, 'heat')).toBe(true)
  })

  it('finds the symptoms recorded above 0, disabled ones included', () => {
    const e = entry({ regions: [[id('knee', 'l')], [MIND]], readings: [{ pain: 0 }, { fog: 4 }] })
    expect(hit(e, 'nebbia')).toBe(true)
    expect(hit(e, 'dolore')).toBe(false)
    expect(hit(entry({ readings: [{ pain: 2 }] }), 'dolore')).toBe(true)
  })

  it("finds a head or a chronic entry by its preset's name, never an update", () => {
    const head = entry({ presetId: 'p1', kind: 'episode' })
    head.episodeId = head.id
    expect(hit(head, 'emicr')).toBe(true)
    expect(hit(entry({ presetId: 'p1' }), 'emicr')).toBe(true)
    expect(hit({ ...entry({ presetId: 'p1', kind: 'episode' }), episodeId: head.id }, 'emicr')).toBe(false)
    expect(hit(entry({ presetId: 'gone' }), 'emicr')).toBe(false)
  })

  it('finds a region by every word of the anatomy that covers it, on its side and on both', () => {
    const knee = entry({ regions: [[id('knee', 'l')]] })
    for (const q of ['ginocchio', 'ginocchia', 'gamba', 'gambe', 'ginocchio sx', 'gamba sx']) expect(hit(knee, q), q).toBe(true)
    for (const q of ['coscia', 'braccio', 'ginocchio dx']) expect(hit(knee, q), q).toBe(false)
    // The back of the knee is the knee too, and has its own words.
    const hollow = entry({ regions: [[id('knee.back', 'r')]] })
    for (const q of ['ginocchio dx', 'dietro il ginocchio', 'gamba']) expect(hit(hollow, q), q).toBe(true)
  })

  it('a word finds a reading summed up by a wider one, and a wider word a reading with one part', () => {
    const leg = entry({ regions: [REGIONS.filter((r) => r.side === 'l' && (r.id[1] === '5' || r.id[1] === '6')).map((r) => r.id)] })
    expect(hit(leg, 'ginocchio sx')).toBe(true)
    expect(hit(leg, 'caviglia')).toBe(true)
    expect(hit(entry({ regions: [[id('lowerback', 'r')]] }), 'schiena')).toBe(true)
  })

  it('a side binds to the word next to it: "ginocchio sx" is the left knee, not a right knee and something on the left', () => {
    const e = entry({ regions: [[id('knee', 'r'), id('hand', 'l')]] })
    expect(hit(e, 'ginocchio sx')).toBe(false)
    expect(hit(e, 'ginocchio dx')).toBe(true)
    expect(hit(e, 'mano sx ginocchio')).toBe(true)
    expect(hit(e, 'sx')).toBe(true)
    expect(hit(entry({ regions: [[id('knee', 'r')]] }), 'sx')).toBe(false)
  })

  it('a side binds only to a place: next to a symptom or a tag it is any side, as typed alone', () => {
    const left = entry({ regions: [[id('knee', 'l')]], readings: [{ pain: 3 }], tags: [['heat']] })
    const right = entry({ regions: [[id('knee', 'r')]], readings: [{ pain: 3 }], tags: [['heat']] })
    for (const q of ['dolore sx', 'sx dolore', 'calore sx', 'dolore ginocchio sx']) expect(hit(left, q), q).toBe(true)
    for (const q of ['dolore sx', 'calore sx', 'dolore ginocchio sx']) expect(hit(right, q), q).toBe(false)
    prefs.lang = 'en'
    expect(matches(left, 'left pain', ctx())).toBe(true)
    expect(matches(right, 'left pain', ctx())).toBe(false)
  })

  it('binds sides in English too, where they come first', () => {
    prefs.lang = 'en'
    const e = entry({ regions: [[id('knee', 'r'), id('hand', 'l')]] })
    expect(hit(e, 'left knee')).toBe(false)
    expect(hit(e, 'right knee')).toBe(true)
    expect(hit(e, 'left hand')).toBe(true)
  })

  it('full body is its own words, not every region', () => {
    const e = entry({ regions: [[FULL_BODY]] })
    expect(hit(e, 'tutto il corpo')).toBe(true)
    expect(hit(e, 'ginocchio')).toBe(false)
  })

  it('finds the mind by name', () => {
    expect(hit(entry({ regions: [[MIND]], readings: [{ fog: 2 }] }), 'mente')).toBe(true)
  })

  it('ignores region ids it does not know', () => {
    expect(hit(entry({ regions: [['999']] }), 'gamba')).toBe(false)
  })
})

describe('search', () => {
  it('keeps the matching readings, newest first', () => {
    const a = entry({ at: '2026-09-01T10:00:00.000Z', note: 'corsa' })
    const b = entry({ at: '2026-09-03T10:00:00.000Z', note: 'corsa lunga' })
    const c = entry({ at: '2026-09-02T10:00:00.000Z', note: 'nuoto' })
    expect(search([a, b, c], 'corsa', ctx())).toEqual([b, a])
  })
})

describe('snippet', () => {
  it('leaves a short note, or one matching early, as it is', () => {
    expect(snippet('Corsa al parco', 'parco')).toBe('Corsa al parco')
    expect(snippet('Una nota lunga che non contiene la parola cercata da nessuna parte', 'nuoto')).toBe('Una nota lunga che non contiene la parola cercata da nessuna parte')
  })

  it('starts a long note a word or two before the first match', () => {
    const note = 'Giornata lunga in ufficio, poi la sera male forte dopo la Tachipirina presa tardi'
    expect(snippet(note, 'tachi')).toBe('…male forte dopo la Tachipirina presa tardi')
  })

  it('finds the match through accents and case', () => {
    const note = 'Molte cose da raccontare oggi, ma soprattutto perché il ginocchio cede'
    expect(snippet(note, 'PERCHE')).toMatch(/^…ma soprattutto perché/)
  })
})
