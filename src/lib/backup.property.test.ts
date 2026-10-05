/**
 * The backup round trip for any diary, not just the ones someone wrote down (#91). fast-check generates whole files of
 * today's export version and shrinks a failure to its smallest diary; the failure message carries the seed to replay it
 * (`fc.assert(..., { seed, path })`). The frozen fixtures of `migrations.test.ts` stay: they record what past versions
 * actually wrote, which no generator can know.
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { resetDb } from './db'
import { parseImport, applyImport, buildExport, type ExportFile } from './backup'
import { diary } from '../test/arbitraries'

type Row = Record<string, unknown>
/** What a value is once written to a file: the comparison every property makes. */
const json = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
/** A file's rows, each table in id order: the export sorts its own way, which is not what is compared. */
const rows = (f: ExportFile) => ({
  symptoms: byId(f.vocabulary.symptoms),
  tags: byId(f.vocabulary.tags),
  entries: byId(f.entries),
  presets: byId(f.presets),
})

describe('backup, for any diary (#91)', () => {
  it('imports a file of the current version exactly as written', () => {
    fc.assert(
      fc.property(diary, (file) => {
        expect(parseImport(JSON.stringify(file))).toEqual(json(file))
      }),
      { numRuns: 200 },
    )
  })

  it('export → import → export is the identity, through the database', async () => {
    await fc.assert(
      fc.asyncProperty(diary, async (file) => {
        resetDb()
        const parsed = parseImport(JSON.stringify(file))
        await applyImport(parsed, 'replace')
        const out = await buildExport()
        expect(rows(out)).toEqual(rows(parsed))
        expect(parseImport(JSON.stringify(out))).toEqual(json(out))
      }),
      { numRuns: 60 },
    )
  })

  /** Unknown fields, keys no version uses (`x_` first), with any JSON value. */
  const extra = fc.dictionary(fc.stringMatching(/^x_[a-z]{1,6}$/), fc.jsonValue({ maxDepth: 2 }), { minKeys: 1, maxKeys: 2 })
  /** The same diary with fields the code does not know at every level a row has: entry, layer, paint, vocabulary, preset, preset layer. */
  const withUnknown = diary.chain((file) =>
    fc.tuple(fc.constant(file), fc.infiniteStream(extra)).map(([f, more]) => {
      const add = <T extends object>(x: T): T => ({ ...x, ...more.next().value })
      const strokes = (l: Row) => (Array.isArray(l.strokes) ? { strokes: (l.strokes as object[]).map(add) } : {})
      return {
        ...f,
        vocabulary: { symptoms: f.vocabulary.symptoms.map(add), tags: f.vocabulary.tags.map(add) },
        entries: f.entries.map((e) => add({ ...e, layers: e.layers.map((l) => add({ ...l, ...strokes(l as Row) })) })),
        presets: f.presets.map((p) => add({ ...p, layers: p.layers.map((l) => add({ ...l, ...strokes(l as Row) })) })),
      } as ExportFile
    }),
  )

  it('keeps fields it does not know, at every level, through import, the database and export', async () => {
    await fc.assert(
      fc.asyncProperty(withUnknown, async (file) => {
        resetDb()
        const parsed = parseImport(JSON.stringify(file))
        expect(parsed).toEqual(json(file))
        await applyImport(parsed, 'replace')
        expect(rows(await buildExport())).toEqual(rows(json(file)))
      }),
      { numRuns: 60 },
    )
  })
})
