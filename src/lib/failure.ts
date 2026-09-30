import { t } from '../i18n/index.svelte'
import { showToast } from './toast.svelte'

/**
 * A write that failed (storage full, the database closed by the browser): said in one line, never silent (§4.1). The
 * caller leaves its form or sheet as it was, so nothing typed is lost and Salva can simply be pressed again.
 */
export function failed(e: unknown): void {
  console.error(e)
  showToast(t('error.write'))
}
