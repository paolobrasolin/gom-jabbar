import type { CloudProvider, Failure, Result, Uploaded } from './cloud'
import { buildExport } from './backup'
import { prefs, savePrefs } from './prefs.svelte'
import { t, locale } from '../i18n/index.svelte'

/** A Drive time, down to the minute: backups are minutes apart, not days. */
export const driveTime = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** What went wrong, in one line, for the card and the banner's toast. */
export function failureText(f: { ok?: false; reason: Failure; status?: number; remoteAt?: string }): string {
  if (f.reason === 'http') return t('drive.error.http', { s: f.status ?? '?' })
  if (f.reason === 'conflict') return t('drive.error.conflict', { d: driveTime(f.remoteAt!) })
  return t(`drive.error.${f.reason}`)
}

/** This device has connected and not disconnected: it knows an account or has written the file (§4.2). */
export function driveInUse(cloud: CloudProvider): boolean {
  if (!cloud.available) return false
  const s = cloud.status()
  return s.account !== null || s.lastWriteAt !== null
}

/**
 * The one Drive backup step, for the card and the banner alike. Without a live token it leaves for the consent
 * screen (`'left'`); the app comes back to Settings, which runs it again. A success counts as a backup like the
 * share sheet's: it sets the shared date and clears the snooze.
 */
export async function cloudBackup(cloud: CloudProvider, opts: { force?: boolean } = {}): Promise<Result<Uploaded> | 'left'> {
  if (!cloud.status().expiresAt) {
    cloud.connect('backup')
    return 'left'
  }
  if (!cloud.status().account) await cloud.whoami()
  const res = await cloud.put(JSON.stringify(await buildExport(), null, 1), opts)
  if (res.ok) {
    prefs.lastBackupAt = new Date().toISOString()
    prefs.backupSnoozedUntil = null
    savePrefs()
  }
  return res
}

/** What a backup that landed says: done, and, when it kept a much larger file it replaced, when that file was written (#113). */
export const doneText = (up: Uploaded): string => (up.kept ? t('drive.doneKept', { d: driveTime(up.kept) }) : t('drive.done'))
