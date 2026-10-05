/**
 * Generated diaries for property-based tests (#91): whole files of the current export version, as the app writes them.
 * Every value survives JSON as it is (no -0, NaN or undefined), so a file and its round trip can be compared directly.
 */
import fc from 'fast-check'
import { REGIONS, MIND, FULL_BODY } from '../lib/regions'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from '../lib/vocabulary'
import { EXPORT_VERSION, type ExportFile } from '../lib/backup'
import type { Entry, Preset, Symptom, Tag, TagGroup, Stroke } from '../lib/types'

const REGION_IDS = REGIONS.map((r) => r.id)
const T0 = Date.UTC(2020, 0, 1)
const T1 = Date.UTC(2030, 0, 1)

/** An instant as the app stores one, to the millisecond. */
export const iso = (min = T0, max = T1) => fc.integer({ min, max }).map((t) => new Date(t).toISOString())
/** Any text a person might type: every unicode plane, empty included. */
const text = fc.string({ unit: 'grapheme', maxLength: 40 })
const id = fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/)
/** Up to `max` of `xs`, each once, in their order. */
const some = <T,>(xs: T[], max: number) => fc.subarray([...new Set(xs)], { maxLength: Math.min(max, new Set(xs).size) })

const symptom = (sid: string): fc.Arbitrary<Symptom> =>
  fc.record({
    id: fc.constant(sid),
    label: fc.oneof(fc.constant(`i18n:vocab.${sid}`), text.filter((s) => s.trim() !== '' && !s.startsWith('i18n:'))),
    category: fc.constantFrom('body' as const, 'mind' as const),
    enabled: fc.boolean(),
    order: fc.nat(40),
  })
const tag = (tid: string): fc.Arbitrary<Tag> =>
  fc.record({
    id: fc.constant(tid),
    label: fc.oneof(fc.constant(`i18n:vocab.${tid}`), text.filter((s) => s.trim() !== '' && !s.startsWith('i18n:'))),
    group: fc.constantFrom<TagGroup>('intervention', 'context', 'medication'),
    enabled: fc.boolean(),
    order: fc.nat(40),
  })

/** The seed's ids, some left out, and some of the person's own. */
const ids = (seed: string[], prefix: string) =>
  fc.tuple(fc.subarray(seed), fc.uniqueArray(id.map((x) => `${prefix}${x}`), { maxLength: 4 })).map(([a, b]) => [...a, ...b])

const regions: fc.Arbitrary<string[]> = fc.oneof(
  { weight: 1, arbitrary: fc.constant<string[]>([FULL_BODY]) },
  { weight: 6, arbitrary: some([...REGION_IDS, MIND], 6).map((r) => [...r].sort()) },
)
/** A piece of paint (§5.3): points rounded to a tenth, as the brush stores them. */
const stroke: fc.Arbitrary<Stroke> = fc.record({
  region: fc.constantFrom(...REGION_IDS),
  fig: fc.constantFrom('female' as const, 'male' as const),
  view: fc.constantFrom('front' as const, 'back' as const),
  points: fc.array(fc.tuple(fc.integer({ min: 0, max: 2800 }), fc.integer({ min: 0, max: 5800 })).map(([x, y]): [number, number] => [x / 10, y / 10]), { minLength: 1, maxLength: 5 }),
  w: fc.integer({ min: 1, max: 30 }),
})
const withStrokes = <T extends object>(base: fc.Arbitrary<T>) =>
  fc.tuple(base, fc.option(fc.array(stroke, { minLength: 1, maxLength: 3 }), { nil: undefined })).map(([b, s]) => (s ? { ...b, strokes: s } : b))

const layer = (symptomIds: string[], tagIds: string[]) =>
  withStrokes(
    fc.record({
      regions,
      readings: fc.dictionary(fc.constantFrom(...symptomIds, 'pain'), fc.integer({ min: 0, max: 10 }), { maxKeys: 4 }),
      tags: some(tagIds, 3),
    }),
  )

/** A chronic snapshot, or an episode: its head with an end or none, and its updates after the start. */
const entries = (symptomIds: string[], tagIds: string[], presetIds: string[]) => {
  const layers = fc.array(layer(symptomIds, tagIds), { minLength: 1, maxLength: 3 })
  const presetId = presetIds.length ? fc.option(fc.constantFrom(...presetIds), { nil: undefined }) : fc.constant(undefined)
  const base = (eid: string, at: string) =>
    fc.record({ layers, note: text, presetId, createdAt: iso(), updatedAt: iso() }).map(({ presetId: p, ...r }) => ({
      id: eid,
      at,
      ...r,
      ...(p ? { presetId: p } : {}),
    }))
  const chronic = fc.tuple(id, iso()).chain(([eid, at]) => base(eid, at).map((e): Entry[] => [{ ...e, kind: 'chronic' }]))
  const episode = fc.tuple(id, fc.integer({ min: T0, max: T1 - 86_400_000 })).chain(([eid, t]) =>
    fc
      .tuple(
        base(eid, new Date(t).toISOString()),
        fc.option(iso(t, T1), { nil: null }),
        // Times may repeat, as in histories split from version 7 (§8), and ids run past :9, so ties and :10 are tried.
        fc.array(fc.oneof(fc.integer({ min: t + 1, max: t + 86_400_000 }), fc.constant(t + 3_600_000)), { maxLength: 11 }),
      )
      .chain(([head, endedAt, times]) =>
        fc.tuple(...times.map((u, i) => base(`${eid}:${i + 1}`, new Date(u).toISOString()))).map((updates): Entry[] => [
          { ...head, kind: 'episode', episodeId: eid, endedAt },
          ...updates.map(({ presetId: _p, ...u }) => ({ ...u, kind: 'episode' as const, episodeId: eid })),
        ]),
      ),
  )
  return fc
    .array(fc.oneof(chronic, episode), { maxLength: 12 })
    .map((groups) => groups.flat())
    // Ids are unique across the diary: a clash between two generated groups keeps the first.
    .map((all) => all.filter((e, i) => all.findIndex((x) => x.id === e.id) === i))
    .map((all) => all.filter((e) => !e.episodeId || all.some((h) => h.id === e.episodeId)))
}

const preset = (pid: string, symptomIds: string[]): fc.Arbitrary<Preset> =>
  fc.record({
    id: fc.constant(pid),
    name: text.filter((s) => s.trim() !== ''),
    layers: fc.array(withStrokes(fc.record({ regions, asks: some([...symptomIds, 'pain'], 3) })), { minLength: 1, maxLength: 3 }),
    kind: fc.constantFrom('chronic' as const, 'episode' as const),
    order: fc.nat(20),
  })

/** A whole diary as the app exports it today: vocabulary, presets and entries that refer to them. */
export const diary: fc.Arbitrary<ExportFile> = fc
  .record({
    symptomIds: ids(DEFAULT_SYMPTOMS.map((s) => s.id), 's_'),
    tagIds: ids(DEFAULT_TAGS.map((t) => t.id), 't_'),
    presetIds: fc.uniqueArray(id.map((x) => `p_${x}`), { maxLength: 4 }),
  })
  .chain(({ symptomIds, tagIds, presetIds }) =>
    fc.record({
      app: fc.constant('gom-jabbar' as const),
      version: fc.constant(EXPORT_VERSION),
      exportedAt: iso(),
      vocabulary: fc.record({ symptoms: fc.tuple(...symptomIds.map(symptom)), tags: fc.tuple(...tagIds.map(tag)) }),
      entries: entries(symptomIds, tagIds, presetIds),
      presets: fc.tuple(...presetIds.map((p) => preset(p, symptomIds))),
    }),
  )
