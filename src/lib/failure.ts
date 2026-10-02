import { t } from '../i18n/index.svelte'
import { showFailure } from './toast.svelte'
import { outdated } from './outdated.svelte'

/**
 * A write that failed (storage full, the database closed by the browser): said in one line, never silent (§4.1). The
 * caller leaves its form or sheet as it was, so nothing typed is lost and Salva can simply be pressed again.
 */
export function failed(e: unknown): void {
  console.error(e)
  // A newer copy closed the database: the lasting notice already says why, and a retry will not help (#113).
  if (outdated.value) return
  showFailure(t('error.write'))
}
