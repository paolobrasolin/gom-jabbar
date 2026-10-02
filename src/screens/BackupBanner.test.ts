import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { install } from '../lib/install.svelte'
import { addEntry } from '../lib/entries'
import { dismissToast } from '../lib/toast.svelte'
import { fakeGoogle } from '../test/fakeDrive'
import App from '../App.svelte'

const DAY = 86_400_000
let db: ReturnType<typeof resetDb>
let clock: number
let g: ReturnType<typeof fakeGoogle>

beforeEach(() => {
  db = resetDb()
  localStorage.clear()
  prefs.lang = 'it'
  prefs.lastBackupAt = null
  prefs.backupSnoozedUntil = null
  // Installed: the install nudge would stand in front of the backup banner.
  prefs.installedAt = '2026-01-01T00:00:00.000Z'
  install.dismissed = false
  history.replaceState(null, '', '/')
  dismissToast()
  clock = Date.now()
  g = fakeGoogle(() => clock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
/** A diary started `days` ago. */
async function diarySince(days: number) {
  const e = await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }] })
  await db.entries.update(e.id, { createdAt: ago(days) })
}
/** This phone backed up to Drive `days` ago; the token of that session is long dead. */
async function droveAgo(days: number) {
  clock = Date.now() - days * DAY
  g.signIn()
  await g.provider.whoami()
  expect((await g.provider.put('{}')).ok).toBe(true)
  clock = Date.now()
}
function stubShare() {
  const shared: File[] = []
  vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: async (d: ShareData) => void shared.push(...(d.files as File[])) })
  return shared
}

describe('Backup banner without Drive', () => {
  it('asks 14 days into the diary and shares the backup', async () => {
    await diarySince(15)
    const shared = stubShare()
    render(App, { props: { cloud: g.provider } })
    expect(await screen.findByText("È da un po' che non fai un backup.")).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Backup' }))
    await waitFor(() => expect(shared).toHaveLength(1))
    expect(await screen.findByText('Backup su file fatto')).toBeInTheDocument()
    expect(prefs.lastBackupAt).not.toBeNull()
    await waitFor(() => expect(screen.queryByText("È da un po' che non fai un backup.")).not.toBeInTheDocument())
  })

  it("a double tap on the banner's Backup shares one file, not two (#115)", async () => {
    await diarySince(15)
    // The share sheet stays open until released, as on the phone: the second tap lands while the first is in flight.
    let release = () => {}
    const open = new Promise<void>((r) => (release = r))
    let shares = 0
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: async () => void (shares++, await open) })
    render(App, { props: { cloud: g.provider } })
    await screen.findByText("È da un po' che non fai un backup.")
    const button = screen.getByRole('button', { name: 'Backup' })
    await fireEvent.click(button)
    await fireEvent.click(button)
    await waitFor(() => expect(shares).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 50))
    release()
    expect(await screen.findByText('Backup su file fatto')).toBeInTheDocument()
    expect(shares).toBe(1)
  })

  it('stays quiet for 13 days, and for 7 more after Più tardi', async () => {
    await diarySince(13)
    render(App, { props: { cloud: g.provider } })
    await screen.findByRole('button', { name: 'Salva' })
    expect(screen.queryByText("È da un po' che non fai un backup.")).not.toBeInTheDocument()
    prefs.lastBackupAt = ago(20)
    await fireEvent.click(await screen.findByRole('button', { name: 'Più tardi' }))
    expect(Date.parse(prefs.backupSnoozedUntil!) - Date.now()).toBeGreaterThan(7 * DAY - 60_000)
    expect(Date.parse(prefs.backupSnoozedUntil!) - Date.now()).toBeLessThanOrEqual(7 * DAY)
    expect(screen.queryByText("È da un po' che non fai un backup.")).not.toBeInTheDocument()
  })
})

describe('Backup banner with Drive', () => {
  it('asks 7 days after the last Drive backup, whatever the share sheet did since, and backs up in place', async () => {
    await diarySince(30)
    await droveAgo(9)
    prefs.lastBackupAt = ago(1)
    g.signIn()
    render(App, { props: { cloud: g.provider } })
    expect(await screen.findByText('Ultimo backup su Drive 9 giorni fa.')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Backup su Drive' }))
    expect(await screen.findByText('Backup su Drive fatto')).toBeInTheDocument()
    expect(JSON.parse([...g.drive.files.values()][0].revs.at(-1)!.content).entries).toHaveLength(1)
    await waitFor(() => expect(screen.queryByText(/^Ultimo backup su Drive/)).not.toBeInTheDocument())
    expect(g.navigated).toHaveLength(2)
  })

  it('stays quiet for 6 days after a Drive backup', async () => {
    await diarySince(30)
    await droveAgo(6)
    render(App, { props: { cloud: g.provider } })
    await screen.findByRole('button', { name: 'Salva' })
    expect(screen.queryByText(/backup/i)).not.toBeInTheDocument()
  })

  it('leaves for Google when the token is dead', async () => {
    await diarySince(30)
    await droveAgo(9)
    render(App, { props: { cloud: g.provider } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Backup su Drive' }))
    expect(g.navigated).toHaveLength(2)
    expect(new URL(g.navigated[1]).searchParams.get('login_hint')).toBe('paolo@example.test')
  })

  it('names a failure in a toast and keeps asking', async () => {
    await diarySince(30)
    await droveAgo(9)
    g.signIn()
    g.drive.failures.push({ match: /GET .*files/, network: true })
    render(App, { props: { cloud: g.provider } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Backup su Drive' }))
    expect(await screen.findByText('Rete assente o instabile.')).toBeInTheDocument()
    expect(screen.getByText('Ultimo backup su Drive 9 giorni fa.')).toBeInTheDocument()
  })

  it('counts from the diary when this phone connected but never wrote, and snoozes 3 days', async () => {
    await diarySince(8)
    g.signIn()
    await g.provider.whoami()
    render(App, { props: { cloud: g.provider } })
    expect(await screen.findByText('Nessun backup su Drive da questo telefono.')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Più tardi' }))
    expect(Date.parse(prefs.backupSnoozedUntil!) - Date.now()).toBeGreaterThan(3 * DAY - 60_000)
    expect(Date.parse(prefs.backupSnoozedUntil!) - Date.now()).toBeLessThanOrEqual(3 * DAY)
    expect(screen.queryByText('Nessun backup su Drive da questo telefono.')).not.toBeInTheDocument()
  })
})

describe('One banner at a time (#37)', () => {
  it('the install nudge goes first; the backup banner waits until it is dismissed', async () => {
    prefs.installedAt = null
    await diarySince(15)
    render(App, { props: { cloud: g.provider } })
    const install = screen.getByText(/Aggiungi alla schermata Home per/).closest('.msg')!
    // A standing message (#94): the page's colours, the icon of a message that needs you.
    expect(install).toHaveClass('standing')
    expect(install.querySelector('svg.icon')).toHaveAttribute('data-icon', 'needs')
    // Give the live query time to find the old diary: the backup banner still does not show.
    await waitFor(() => expect(document.querySelectorAll('.nudge')).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText("È da un po' che non fai un backup.")).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Non ora' }))
    const backup = (await screen.findByText("È da un po' che non fai un backup.")).closest('.msg')!
    expect(backup).toHaveClass('standing')
    expect(backup.querySelector('svg.icon')).toHaveAttribute('data-icon', 'needs')
  })
})
