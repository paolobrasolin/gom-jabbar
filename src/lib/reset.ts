import { db } from './db'
import type { CloudProvider } from './cloud'

/**
 * Cancella tutto (§6.4): back to a fresh install. The one deletion outside `applyImport('replace')` and the undo
 * toasts, and the one without undo (a snapshot kept for undo would defeat it); the sheet that leads here is the
 * app's only confirmation. The caller reloads afterwards: the next launch creates the database again, seeded with
 * the default vocabulary, and starts from default preferences. The service worker and the Drive file are untouched.
 */
export async function resetAll(cloud: CloudProvider): Promise<void> {
  // First, while the token is still in storage: the grant is revoked, not just forgotten.
  await cloud.disconnect()
  await db.delete()
  try {
    localStorage.clear()
  } catch {
    /* storage unavailable: nothing was kept there */
  }
}
