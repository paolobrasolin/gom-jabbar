/**
 * Upgrades and the importer read only frozen rules (§8, #113): how an old backup or an old database converts must not
 * change when today's app changes its own helpers (which symptoms a layer shows, the default category, the seed). Every
 * fixture is converted twice, the second time with those live helpers swapped for nonsense: the results must agree.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import Dexie from 'dexie'

const exports = import.meta.glob<{ default: Record<string, unknown> }>('../test/fixtures/export-v*.json', { eager: true })
const dbs = import.meta.glob<{ default: { version: number; stores: Record<string, string>; tables: Record<string, unknown[]> } }>('../test/fixtures/db-v*.json', { eager: true })
const byId = (rows: { id: string }[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))

async function convertAll() {
  const { parseImport } = await import('./backup')
  const { GomJabbarDB } = await import('./db')
  const files: unknown[] = []
  for (const [path, { default: f }] of Object.entries(exports)) {
    files.push([path, parseImport(JSON.stringify(f))])
    // The same file without a vocabulary reads as carrying the seed.
    const { vocabulary: _, ...bare } = f
    files.push([path + ' bare', parseImport(JSON.stringify(bare))])
  }
  const rows: unknown[] = []
  for (const [path, { default: f }] of Object.entries(dbs)) {
    const name = 'gj-frozen-' + Math.random().toString(36).slice(2)
    const old = new Dexie(name)
    old.version(f.version).stores(f.stores)
    for (const [table, list] of Object.entries(f.tables)) await old.table(table).bulkAdd(list)
    old.close()
    const now = new GomJabbarDB(name)
    await now.open()
    for (const t of now.tables) rows.push([path, t.name, byId((await t.toArray()) as { id: string }[])])
    now.close()
  }
  return { files, rows }
}

afterEach(() => {
  vi.doUnmock('./vocabulary')
  vi.doUnmock('./layers')
  vi.resetModules()
})

describe('frozen rules', () => {
  it('every old backup and database converts the same whatever today’s helpers say', async () => {
    const before = await convertAll()
    vi.resetModules()
    vi.doMock('./vocabulary', async (orig) => ({
      ...(await orig<typeof import('./vocabulary')>()),
      defaultCategory: () => 'mind',
      DEFAULT_SYMPTOMS: [{ id: 'nonsense', label: 'x', category: 'mind', enabled: false, order: 0 }],
      DEFAULT_TAGS: [],
    }))
    vi.doMock('./layers', async (orig) => ({
      ...(await orig<typeof import('./layers')>()),
      hasBody: () => false,
      holdsMind: () => false,
      showsCategory: () => false,
    }))
    const after = await convertAll()
    expect(after).toEqual(before)
  })
})
