/**
 * A damaged backup is refused cleanly or read whole (#91): any one key deleted, or any one value replaced by one of
 * another type, anywhere in a valid file. Refused means one of the importer's own reasons, never a crash of the code
 * reading it; read means the diary stores, and exports back as it was stored. Never half-read: accepted by the preview,
 * then failing on Sostituisci tutto, or stored in a shape the app cannot use.
 */
import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { resetDb } from './db'
import { parseImport, applyImport, buildExport } from './backup'
import { diary } from '../test/arbitraries'
import { runs } from '../test/runs'

// Hundreds of diaries through the database: well past the default 5 s under coverage and a loaded machine.
vi.setConfig({ testTimeout: 30_000 })

const REASONS = ['invalid-json', 'invalid-file', 'invalid-entry', 'invalid-preset', 'newer-version']
type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

/** Every path into a JSON value, the root excluded. */
function paths(x: Json, at: (string | number)[] = []): (string | number)[][] {
  if (Array.isArray(x)) return x.flatMap((v, i) => [[...at, i], ...paths(v, [...at, i])])
  if (x && typeof x === 'object') return Object.entries(x).flatMap(([k, v]) => [[...at, k], ...paths(v, [...at, k])])
  return []
}
function edit(x: Json, path: (string | number)[], change: (parent: Record<string | number, Json>, key: string | number) => void): Json {
  const copy = JSON.parse(JSON.stringify(x)) as Json
  let parent = copy as Record<string | number, Json>
  for (const k of path.slice(0, -1)) parent = parent[k] as Record<string | number, Json>
  change(parent, path.at(-1)!)
  return copy
}
const other: fc.Arbitrary<Json> = fc.oneof(fc.constant<Json>(null), fc.boolean(), fc.integer(), fc.string({ maxLength: 5 }), fc.constant<Json>([]), fc.constant<Json>({}), fc.constant<Json>([1, 'a']))

/** A valid file with one thing broken in it. */
const damaged = diary.chain((file) => {
  const json = JSON.parse(JSON.stringify(file)) as Json
  return fc.tuple(fc.constantFrom(...paths(json)), fc.oneof(fc.constant('delete' as const), other)).map(([path, how]) => ({
    damage: `${path.join('.')} ${how === 'delete' ? 'deleted' : `= ${JSON.stringify(how)}`}`,
    file: edit(json, path, (parent, key) => {
      if (how === 'delete') {
        if (Array.isArray(parent)) parent.splice(key as number, 1)
        else delete parent[key]
      } else parent[key] = how
    }),
  }))
})

describe('a damaged backup (#91)', () => {
  it('is refused for one of the importer’s reasons, or read whole: it stores, and exports back as stored', async () => {
    await fc.assert(
      fc.asyncProperty(damaged, async ({ file }) => {
        let parsed
        try {
          parsed = parseImport(JSON.stringify(file))
        } catch (e) {
          expect(e).toBeInstanceOf(Error)
          expect(REASONS, String(e)).toContain((e as Error).message)
          return
        }
        resetDb()
        await applyImport(parsed, 'replace')
        const out = await buildExport()
        expect(parseImport(JSON.stringify(out))).toEqual(JSON.parse(JSON.stringify(out)))
      }),
      { numRuns: runs(150) },
    )
  })
})
