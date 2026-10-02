import type { Table, Transaction } from 'dexie'
import { db } from './db'
import { exportOf, EXPORT_OF_DATABASE, EXPORT_VERSION, type ExportFile } from './backup'

/** Why a snapshot was taken: an upgrade of the database, or a restore about to replace or merge into the diary. */
export type SnapshotReason = 'upgrade' | 'replace' | 'merge'

/**
 * A full copy of the diary kept inside the database (§4.1, #113), as a backup file of the export version its rows are
 * in, so it restores through the same path as any other. Kept apart from the four tables a backup holds: export and
 * replace never touch it; Cancella tutto deletes it with the rest.
 */
/** `id` counts up: the newest is the highest, whatever the clock says. */
export type Snapshot = { id: number; reason: SnapshotReason; takenAt: string; file: ExportFile }

/** How many snapshots of each reason are kept: the newest. */
export const KEEP = 2

/** The diary as `table` reads it, as a backup file of `version`, kept as a snapshot; older ones of its reason pruned. */
async function take(table: (name: string) => Table, reason: SnapshotReason, version: number): Promise<Snapshot> {
  const [symptoms, tags, entries, presets] = await Promise.all(['symptoms', 'tags', 'entries', 'presets'].map((n) => table(n).toArray()))
  const takenAt = new Date().toISOString()
  const snap = { reason, takenAt, file: exportOf({ symptoms, tags, entries, presets }, version, takenAt) } as Snapshot
  const snapshots = table('snapshots')
  snap.id = (await snapshots.add(snap)) as number
  const same = ((await snapshots.toArray()) as Snapshot[]).filter((s) => s.reason === reason).sort(newestFirst)
  await snapshots.bulkDelete(same.slice(KEEP).map((s) => s.id))
  return snap
}

const newestFirst = (a: Snapshot, b: Snapshot) => b.id - a.id

const upgrading = new WeakSet<Transaction>()

/**
 * First thing in every upgrade from version 11 on: the diary as it stands, kept before anything is rewritten. Once per
 * upgrade, however many versions it crosses, so the copy is the diary before the first; `leaving` is the database
 * version of the rows it reads. Inside the upgrade's transaction: an upgrade that fails leaves the old snapshots too.
 */
export async function snapshotUpgrade(tx: Transaction, leaving: number): Promise<void> {
  if (upgrading.has(tx)) return
  upgrading.add(tx)
  await take((n) => tx.table(n), 'upgrade', EXPORT_OF_DATABASE[leaving])
}

/** The diary as it stands now, kept as a snapshot of `reason`. */
export function takeSnapshot(reason: SnapshotReason): Promise<Snapshot> {
  return db.transaction('rw', [db.entries, db.symptoms, db.tags, db.presets, db.snapshots], () => take((n) => db.table(n), reason, EXPORT_VERSION))
}

/** Every snapshot kept, newest first. */
export async function listSnapshots(): Promise<Snapshot[]> {
  return (await db.snapshots.toArray()).sort(newestFirst)
}
