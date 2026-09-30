import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './db'
import { prefs } from './prefs.svelte'
import { addEntry } from './entries'
import { cloudBackup, driveInUse, failureText } from './cloudBackup'
import { fakeGoogle } from '../test/fakeDrive'

const MIN = 60_000
let clock: number
let g: ReturnType<typeof fakeGoogle>

beforeEach(() => {
  resetDb()
  localStorage.clear()
  prefs.lastBackupAt = null
  prefs.backupSnoozedUntil = null
  history.replaceState(null, '', '/')
  clock = Date.parse('2026-09-01T10:00:00.000Z')
  g = fakeGoogle(() => clock)
})

describe('cloudBackup', () => {
  it('leaves for Google without a live token, and changes nothing here', async () => {
    expect(await cloudBackup(g.provider)).toBe('left')
    expect(g.navigated).toHaveLength(1)
    expect(localStorage.getItem('gj.drive')).toContain('"intent":"backup"')
    expect(prefs.lastBackupAt).toBeNull()
  })

  it('uploads the export, learns the account, and records the backup like any other', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }], note: 'ciao' })
    prefs.backupSnoozedUntil = '2030-01-01T00:00:00.000Z'
    g.signIn()
    const res = await cloudBackup(g.provider)
    expect(res).toEqual({ ok: true, value: { at: new Date(clock).toISOString() } })
    const file = JSON.parse([...g.drive.files.values()][0].revs.at(-1)!.content)
    expect(file.entries.map((e: { note: string }) => e.note)).toEqual(['ciao'])
    expect(g.provider.status().account?.email).toBe('paolo@example.test')
    expect(prefs.lastBackupAt).not.toBeNull()
    expect(prefs.backupSnoozedUntil).toBeNull()
    expect(JSON.parse(localStorage.getItem('gj.prefs')!).lastBackupAt).toBe(prefs.lastBackupAt)
  })

  it('asks for the account only once', async () => {
    g.signIn()
    await cloudBackup(g.provider)
    clock += MIN
    await cloudBackup(g.provider)
    expect(g.drive.calls.filter((c) => c.includes('/about'))).toHaveLength(1)
  })

  it('returns a failure untouched and records nothing', async () => {
    g.signIn()
    g.drive.failures.push({ match: /GET .*files/, network: true })
    expect(await cloudBackup(g.provider)).toEqual({ ok: false, reason: 'network' })
    expect(prefs.lastBackupAt).toBeNull()
  })

  it('overwrites a newer remote only with force', async () => {
    g.signIn()
    await cloudBackup(g.provider)
    clock += MIN
    g.drive.write([...g.drive.files.keys()][0], 'theirs')
    clock += MIN
    expect(await cloudBackup(g.provider)).toMatchObject({ ok: false, reason: 'conflict' })
    expect(await cloudBackup(g.provider, { force: true })).toMatchObject({ ok: true })
  })
})

describe('driveInUse', () => {
  it('is true once this device knows an account or has written, false after disconnecting', async () => {
    expect(driveInUse(g.provider)).toBe(false)
    g.signIn()
    expect(driveInUse(g.provider)).toBe(false)
    await cloudBackup(g.provider)
    expect(driveInUse(g.provider)).toBe(true)
    await g.provider.disconnect()
    expect(driveInUse(g.provider)).toBe(false)
  })
  it('is false in a build without Drive', () => {
    expect(driveInUse({ ...g.provider, available: false })).toBe(false)
  })
})

describe('failureText', () => {
  it('names each failure in one line, in the current language', () => {
    prefs.lang = 'it'
    expect(failureText({ ok: false, reason: 'no-token' })).toBe('Accesso scaduto: tocca di nuovo.')
    expect(failureText({ ok: false, reason: 'denied' })).toBe('Accesso a Drive negato.')
    expect(failureText({ ok: false, reason: 'network' })).toBe('Rete assente o instabile.')
    expect(failureText({ ok: false, reason: 'http', status: 503 })).toBe('Drive ha risposto con un errore (503).')
    expect(failureText({ ok: false, reason: 'http' })).toBe('Drive ha risposto con un errore (?).')
    expect(failureText({ ok: false, reason: 'unavailable' })).toBe('Drive non è disponibile in questa versione.')
    // A local time, so the day and the minutes read the same in any time zone.
    const remoteAt = new Date(2026, 8, 28, 18, 41).toISOString()
    expect(failureText({ ok: false, reason: 'conflict', remoteAt })).toBe("Su Drive c'è un backup più recente di questo telefono (28 set, 18:41).")
    prefs.lang = 'en'
    expect(failureText({ ok: false, reason: 'network' })).toBe('No network, or a flaky one.')
    prefs.lang = 'it'
  })
})
