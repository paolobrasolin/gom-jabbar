/**
 * Files and database rows as each past export version wrote them (#91), shaped after its frozen fixtures: what an old
 * backup or an old phone's database can hold, for the migration properties. Dirty rows too, as the protocol asks (no
 * note, no timestamps) and fields no version knows.
 */
import fc from 'fast-check'
import { LEGACY_REGIONS, MIND, FULL_BODY } from '../lib/regions'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from '../lib/vocabulary'
import { REGION_IDS, iso, text, id, some, stroke } from './arbitraries'
import { SEED_IT_V9, type Row } from './upgrades'

const NAMES = Object.keys(LEGACY_REGIONS)
const level = fc.integer({ min: 0, max: 10 })

/** Places as version `v` named them: names before 5, CHOIR codes from 5, the mind from 6; full body all along. */
const regionsOf = (v: number) =>
  fc.oneof(
    { weight: 1, arbitrary: fc.constant([FULL_BODY]) },
    { weight: 6, arbitrary: some(v < 5 ? NAMES : v < 6 ? REGION_IDS : [...REGION_IDS, MIND], 5).map((r) => [...r].sort()) },
  )

/** Both languages before 10: the seed's own Italian (it becomes a dictionary key), a rename, or Italian left empty. */
const labelOf = (table: 'symptoms' | 'tags', rid: string, v: number) => {
  if (v >= 10) return fc.constant(`i18n:vocab.${rid}`)
  const seed = SEED_IT_V9[table][rid]
  return fc.record({ it: fc.oneof(...(seed ? [fc.constant(seed)] : []), text, fc.constant('')), en: text })
}

/** A row's tail: sometimes no note or timestamps (a dirty shape), sometimes a field no version knows. */
const tail = fc.record({
  dirty: fc.boolean(),
  note: text,
  createdAt: iso(),
  updatedAt: iso(),
  unknown: fc.option(fc.record({ x_origin: fc.constantFrom('watch', 'csv'), x_deep: fc.array(fc.nat(9), { maxLength: 2 }) }), { nil: undefined }),
})
const withTail = (row: Row, t: { dirty: boolean; note: string; createdAt: string; updatedAt: string; unknown?: Row }): Row => ({
  ...row,
  ...(t.dirty ? {} : { note: t.note, createdAt: t.createdAt, updatedAt: t.updatedAt }),
  ...(t.unknown ?? {}),
})

type Vocab = { symptoms: Row[]; tags: Row[]; symptomIds: string[]; tagIds: string[] }
const vocabOf = (v: number): fc.Arbitrary<Vocab> =>
  fc
    .tuple(
      fc.subarray(DEFAULT_SYMPTOMS.map((s) => s.id)),
      fc.uniqueArray(id.map((x) => `s_${x}`), { maxLength: 3 }),
      fc.subarray(DEFAULT_TAGS.map((t) => t.id)),
      fc.uniqueArray(id.map((x) => `t_${x}`), { maxLength: 3 }),
    )
    .chain(([ss, sx, ts, tx]) => {
      const symptomIds = [...ss, ...sx]
      const tagIds = [...ts, ...tx]
      return fc.record({
        symptoms: fc.tuple(
          ...symptomIds.map((sid) =>
            fc.record({ label: labelOf('symptoms', sid, v), enabled: fc.boolean(), order: fc.nat(30), category: fc.constantFrom('body', 'mind') }).map(({ category, ...r }) => ({
              id: sid,
              ...r,
              ...(v >= 6 ? { category } : {}),
            })),
          ),
        ),
        tags: fc.tuple(
          ...tagIds.map((tid) =>
            fc.record({ label: labelOf('tags', tid, v), enabled: fc.boolean(), order: fc.nat(30), group: fc.constantFrom('intervention', 'context', 'medication') }).map((r) => ({ id: tid, ...r })),
          ),
        ),
        symptomIds: fc.constant(symptomIds),
        tagIds: fc.constant(tagIds),
      })
    })

const readingsOf = (symptomIds: string[]) => fc.dictionary(fc.constantFrom('pain', ...symptomIds), level, { maxKeys: 3 })
const strokesFor = (v: number) => (v >= 6 ? fc.option(fc.array(stroke, { minLength: 1, maxLength: 2 }), { nil: undefined }) : fc.constant(undefined))
const area = (v: number) =>
  fc.record({ regions: regionsOf(v), intensity: level, strokes: strokesFor(v) }).map(({ strokes, ...a }) => (strokes ? { ...a, strokes } : a))
const layer = (v: number, x: Vocab) =>
  fc
    .record({ regions: regionsOf(v), readings: readingsOf(x.symptomIds), tags: some(x.tagIds, 2), strokes: strokesFor(v) })
    .map(({ strokes, ...l }) => (strokes ? { ...l, strokes } : l))

/** An entry as versions 1 to 7 wrote one: a single row, ongoing or ended, its history a list of points. */
const singleRow = (v: number, x: Vocab, presetIds: string[]) =>
  fc
    .record({
      rid: id,
      at: fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2026, 8, 1) }),
      state: fc.constantFrom('moment', 'ongoing', 'ended'),
      readings: readingsOf(x.symptomIds),
      tags: some(x.tagIds, 3),
      places: v < 2 ? regionsOf(v) : fc.array(area(v), { maxLength: 3 }),
      layers: fc.array(layer(v, x), { minLength: 1, maxLength: 3 }),
      // Points after the start, the first at the start from version 3 on; a ties at the same time too.
      points: fc.array(fc.tuple(fc.integer({ min: 0, max: 86_400_000 }), readingsOf(x.symptoms.map((s) => s.id as string)), level), { maxLength: 4 }),
      fromStart: fc.boolean(),
      preset: v >= 4 && presetIds.length ? fc.option(fc.constantFrom(...presetIds), { nil: undefined }) : fc.constant(undefined),
      tail,
    })
    .map((r) => {
      const at = new Date(r.at).toISOString()
      const timeOf = (d: number) => new Date(r.at + d).toISOString()
      // Version 1 kept no history; from 2 on a reading's points are kept, from 3 the first at the start.
      const pts = r.state === 'moment' || v < 2 ? [] : [...r.points.map(([d]) => d)].sort((a, b) => a - b).map((d, i) => (i === 0 && v >= 3 && r.fromStart ? 0 : d + 1))
      const history =
        v < 3
          ? pts.map((d, i) => ({ at: timeOf(d), pain: r.points[i][2] }))
          : v < 7
            ? pts.map((d, i) => ({ at: timeOf(d), readings: r.points[i][1] }))
            : pts.map((d, i) => ({ at: timeOf(d), layers: r.layers.map((_, j) => (j === 0 ? r.points[i][1] : {})) }))
      const base: Row = {
        id: r.rid,
        at,
        endedAt: r.state === 'ended' ? timeOf(90_000_000) : null,
        ongoing: r.state === 'ongoing',
        ...(v < 7 ? { readings: r.readings, tags: r.tags } : {}),
        ...(v < 2 ? { regions: r.places } : v < 7 ? { areas: r.places } : { layers: r.layers }),
        ...(history.length ? { history } : {}),
        ...(r.preset ? { preset: r.preset } : {}),
      }
      return [withTail(base, r.tail)]
    })

/** Entries as versions 8 and 9 wrote them: chronic rows, and episodes as a head with updates. */
const chainRows = (v: number, x: Vocab, presetIds: string[]) =>
  fc
    .record({
      rid: id,
      at: fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2026, 8, 1) }),
      kind: fc.constantFrom('chronic', 'episode'),
      ended: fc.boolean(),
      layers: fc.array(layer(v, x), { minLength: 1, maxLength: 3 }),
      updates: fc.array(fc.tuple(fc.integer({ min: 1, max: 86_400_000 }), fc.array(layer(v, x), { minLength: 1, maxLength: 2 }), tail), { maxLength: 4 }),
      presetId: presetIds.length ? fc.option(fc.constantFrom(...presetIds), { nil: undefined }) : fc.constant(undefined),
      tail,
    })
    .map((r) => {
      const at = new Date(r.at).toISOString()
      if (r.kind === 'chronic') return [withTail({ id: r.rid, kind: 'chronic', at, layers: r.layers, ...(r.presetId ? { presetId: r.presetId } : {}) }, r.tail)]
      const head = withTail({ id: r.rid, kind: 'episode', episodeId: r.rid, at, endedAt: r.ended ? new Date(r.at + 90_000_000).toISOString() : null, layers: r.layers, ...(r.presetId ? { presetId: r.presetId } : {}) }, r.tail)
      return [head, ...r.updates.map(([d, layers, t], i) => withTail({ id: `${r.rid}:${i + 1}`, kind: 'episode', episodeId: r.rid, at: new Date(r.at + d).toISOString(), layers }, t))]
    })

const presetOf = (v: number, pid: string, x: Vocab) =>
  fc
    .record({
      name: text,
      order: fc.nat(10),
      episode: fc.boolean(),
      areas: fc.array(area(v), { maxLength: 2 }),
      layers: fc.array(layer(v, x), { minLength: 1, maxLength: 2 }),
      symptomIds: some(['pain', ...x.symptomIds], 3),
      tags: some(x.tagIds, 2),
      asks: fc.array(some(['pain', ...x.symptomIds], 3), { minLength: 2, maxLength: 2 }),
    })
    .map((p): Row => {
      const head = { id: pid, name: p.name, order: p.order }
      if (v < 7) return { ...head, areas: p.areas.map(({ intensity: _i, ...a }) => ({ ...a, intensity: 5 })), symptomIds: p.symptomIds, tags: p.tags, ongoing: p.episode }
      if (v < 8) return { ...head, symptomIds: p.symptomIds, ongoing: p.episode, layers: p.layers }
      if (v < 9) return { ...head, symptomIds: p.symptomIds, kind: p.episode ? 'episode' : 'chronic', layers: p.layers }
      return { ...head, kind: p.episode ? 'episode' : 'chronic', layers: p.layers.map((l, i) => ({ ...l, asks: p.asks[i % 2] })) }
    })

export type OldFile = { app: 'gom-jabbar'; version: number; exportedAt: string; vocabulary: { symptoms: Row[]; tags: Row[] }; entries: Row[]; presets?: Row[] }

/** A whole file of export version `v` (1 to 9): its vocabulary, presets from 4, and entries in that version's shape. */
export const fileOfVersion = (v: number): fc.Arbitrary<OldFile> =>
  fc
    .tuple(vocabOf(v), v >= 4 ? fc.uniqueArray(id.map((x) => `p_${x}`), { maxLength: 3 }) : fc.constant<string[]>([]))
    .chain(([x, presetIds]) =>
      fc.record({
        app: fc.constant('gom-jabbar' as const),
        version: fc.constant(v),
        exportedAt: iso(),
        vocabulary: fc.constant({ symptoms: x.symptoms, tags: x.tags }),
        entries: fc.array(v < 8 ? singleRow(v, x, presetIds) : chainRows(v, x, presetIds), { maxLength: 8 }).map((groups) => {
          // Ids are unique across the file: a clash between two generated rows keeps the first one's group.
          const seen = new Set<string>()
          return groups.filter((g) => g.every((e) => !seen.has(e.id as string)) && (g.forEach((e) => seen.add(e.id as string)), true)).flat()
        }),
        ...(v >= 4 ? { presets: fc.tuple(...presetIds.map((p) => presetOf(v, p, x))) } : {}),
      }),
    )
