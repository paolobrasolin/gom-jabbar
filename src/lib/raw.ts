import { EXPORT_OF_DATABASE, exportFilename, shareOrDownload } from './backup'

/** Every table of the database as it sits on the phone, and the version it is stored in (Dexie's, not the native number). */
export type RawDatabase = { version: number; tables: Record<string, unknown[]> }

/**
 * Reads every row of every table without Dexie and without asking for a version (§4.1, #113), so whatever kept the
 * diary from opening (a failed upgrade, a newer release, a bug) does not keep it from being read. Null when there is
 * no database: opening one that does not exist would create it, so that is aborted and nothing is left behind.
 */
export function readRaw(name = 'gom-jabbar'): Promise<RawDatabase | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name)
    let none = false
    req.onupgradeneeded = () => {
      none = true
      req.transaction!.abort()
    }
    req.onerror = () => (none ? resolve(null) : reject(req.error))
    req.onsuccess = () => {
      const idb = req.result
      const names = [...idb.objectStoreNames]
      const version = Math.floor(idb.version / 10)
      if (!names.length) return idb.close(), resolve({ version, tables: {} })
      const tx = idb.transaction(names, 'readonly')
      const tables: Record<string, unknown[]> = {}
      for (const n of names) {
        const all = tx.objectStore(n).getAll()
        all.onsuccess = () => (tables[n] = all.result)
      }
      tx.oncomplete = () => (idb.close(), resolve({ version, tables }))
      tx.onerror = () => (idb.close(), reject(tx.error))
    }
  })
}

/**
 * The raw data as a file. A database version this code knows comes out as a backup of the export version that wrote
 * its rows (§8), so Ripristina reads it like any other; tables a backup does not hold follow under `tables`. A newer
 * one comes out whole, as `database` and `tables`, and is no backup: this code cannot say what its rows are.
 */
export function rawFile(raw: RawDatabase, now = new Date()): string {
  const version = EXPORT_OF_DATABASE[raw.version]
  if (version === undefined) return JSON.stringify({ database: raw.version, exportedAt: now.toISOString(), tables: raw.tables })
  const { symptoms = [], tags = [], entries = [], presets, ...tables } = raw.tables
  return JSON.stringify({
    app: 'gom-jabbar',
    version,
    exportedAt: now.toISOString(),
    vocabulary: { symptoms, tags },
    entries,
    ...(presets ? { presets } : {}),
    ...(Object.keys(tables).length ? { tables } : {}),
  })
}

/** Reads the raw data and hands it to the share sheet, or downloads it (§4.1). False when there is no database at all. */
export async function downloadRaw(name?: string): Promise<boolean> {
  const raw = await readRaw(name)
  if (!raw) return false
  await shareOrDownload(exportFilename('json').replace('gom-jabbar-', 'gom-jabbar-grezzo-'), rawFile(raw), 'application/json')
  return true
}
