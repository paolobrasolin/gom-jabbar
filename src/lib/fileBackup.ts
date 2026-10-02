import { buildExport, exportFilename, shareOrDownload } from './backup'
import { prefs, savePrefs } from './prefs.svelte'
import { haptic, showToast, showFailure } from './toast.svelte'
import { t } from '../i18n/index.svelte'

/** The backup in flight: a second tap, on either button, waits for it instead of sharing a second file (#115). */
let running: Promise<void> | null = null

/**
 * The one backup to file (§4.2), for the Settings card and the log's banner alike: the export on the share sheet (or a
 * download), then the date of the last backup, the reminder rearmed and a toast. Backing out of the share sheet is no failure.
 */
export function fileBackup(): Promise<void> {
  running ??= (async () => {
    try {
      await shareOrDownload(exportFilename('json'), JSON.stringify(await buildExport(), null, 1), 'application/json')
      prefs.lastBackupAt = new Date().toISOString()
      prefs.backupSnoozedUntil = null
      savePrefs()
      haptic(20)
      showToast(t('backup.done'))
    } catch (err) {
      if ((err as Error).name !== 'AbortError') showFailure(t('backup.failed'))
    } finally {
      running = null
    }
  })()
  return running
}
