import { db } from './db'
import type { CloudProvider } from './cloud'

/**
 * Cancella tutto (§6.4): back to a fresh install. The one deletion outside `applyImport('replace')` and the undo
 * toasts, and the one without undo (a snapshot kept for undo would defeat it); the sheet that leads here is the
 * app's only confirmation. The caller reloads afterwards: the next launch creates the database again, seeded with
 * the default vocabulary, and starts from default preferences. The service worker and the Drive file are untouched.
 */
export async function resetAll(cloud: CloudProvider): Promise<void> {
  // The diary first, in one step: if that fails nothing has changed, Drive included, and the caller says so.
  await db.delete()
  // Then, while the token is still in storage: the grant is revoked, not just forgotten. It never throws.
  await cloud.disconnect()
  forgetOurs(() => localStorage)
  forgetOurs(() => sessionStorage)
}

/** Only this app's keys (`gj.*`): other apps on the same origin keep theirs. */
function forgetOurs(storage: () => Storage): void {
  try {
    const s = storage()
    for (const k of Object.keys(s)) if (k.startsWith('gj.')) s.removeItem(k)
  } catch {
    /* storage unavailable: nothing was kept there */
  }
}
