import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addEntry } from '../lib/entries'
import { buildExport } from '../lib/backup'
import type { Resumed } from '../lib/cloud'
import { fakeGoogle } from '../test/fakeDrive'
import { dismissToast } from '../lib/toast.svelte'
import { go, back } from '../test/nav'
import App from '../App.svelte'

const MIN = 60_000
let db: ReturnType<typeof resetDb>
let clock: number
let g: ReturnType<typeof fakeGoogle>

beforeEach(() => {
  db = resetDb()
  localStorage.clear()
  prefs.lang = 'it'
  prefs.lastBackupAt = null
  prefs.backupSnoozedUntil = null
  history.replaceState(null, '', '/')
  dismissToast()
  clock = Date.now()
  g = fakeGoogle(() => clock)
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** The app as it starts: straight after Google's consent screen when `resumed` is given, else from the icon. */
function start(resumed: Resumed = null) {
  render(App, { props: { cloud: g.provider, resumed } })
}
async function openSettings() {
  start()
  await go('Impostazioni')
}
/** The Drive zone of the Backup card. */
const card = () => screen.getByRole('group', { name: 'Google Drive' })
const head = () => [...g.drive.files.values()][0].revs.at(-1)!.content

describe('Drive zone', () => {
  it('is not offered in a build without Drive: the Backup card has the file zone only', async () => {
    render(App)
    await go('Impostazioni')
    const backup = screen.getByRole('region', { name: 'Backup' })
    expect(within(backup).queryByRole('group', { name: 'Google Drive' })).not.toBeInTheDocument()
    expect(within(backup).getByRole('group', { name: 'File' })).toBeInTheDocument()
  })

  it('sits in one Backup card, before the file zone, under the shared last-backup line, with no CSV', async () => {
    await openSettings()
    const backup = screen.getByRole('region', { name: 'Backup' })
    const [drive, file] = within(backup).getAllByRole('group')
    expect(drive).toHaveAccessibleName('Google Drive')
    expect(file).toHaveAccessibleName('File')
    expect(within(file).getAllByRole('button').map((b) => b.textContent)).toEqual(['Backup su file', 'Ripristina da file'])
    // The header frames both zones: where the data lives, how much, when it was last backed up.
    const note = within(backup).getByText(/^Il diario sta su questo telefono · \d+ voci$/)
    const last = within(backup).getByText('Nessun backup ancora fatto.')
    expect(note.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(last.compareDocumentPosition(drive) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Esporta CSV' })).not.toBeInTheDocument()
    expect(screen.queryByText(/prova/)).not.toBeInTheDocument()
  })

  it('leaves for Google on the first tap, and does nothing else', async () => {
    await openSettings()
    expect(within(card()).getByText(/^Non collegato/)).toBeInTheDocument()
    expect(within(card()).getByText('Nessun backup su Drive da questo telefono.')).toBeInTheDocument()
    await fireEvent.click(within(card()).getByRole('button', { name: 'Backup su Drive' }))
    expect(g.navigated).toHaveLength(1)
    expect(new URL(g.navigated[0]).host).toBe('accounts.google.com')
    expect(g.drive.calls).toEqual([])
  })

  it('comes back from Google on Settings and finishes the backup it left for', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }], note: 'ciao' })
    start(g.signIn('backup'))
    expect(screen.getByRole('heading', { level: 1, name: 'Impostazioni' })).toBeInTheDocument()
    expect(await screen.findByText('Backup su Drive fatto')).toBeInTheDocument()
    const file = JSON.parse(head())
    expect(file.app).toBe('gom-jabbar')
    expect(file.entries.map((e: { note: string }) => e.note)).toEqual(['ciao'])
    expect(within(card()).getByText('Account: paolo@example.test')).toBeInTheDocument()
    expect(within(card()).getByText(/^Collegato ancora \d+ min/)).toBeInTheDocument()
    expect(within(card()).getByText(/^Ultimo backup su Drive: /)).toBeInTheDocument()
    expect(prefs.lastBackupAt).not.toBeNull()
    expect(screen.getByText(/^Ultimo backup: /)).toBeInTheDocument()
  })

  it('back from Settings, reached from Google, goes to the log, not back to Google (#37)', async () => {
    start(g.signIn('backup'))
    expect(await screen.findByText('Backup su Drive fatto')).toBeInTheDocument()
    await back()
    expect(screen.getByRole('button', { name: 'Salva' })).toBeInTheDocument()
  })

  it('backs up again in place while the token lives, without leaving the app', async () => {
    start(g.signIn('backup'))
    await screen.findByText('Backup su Drive fatto')
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 7 } }] })
    clock += MIN
    await fireEvent.click(within(card()).getByRole('button', { name: 'Backup su Drive' }))
    await waitFor(() => expect(JSON.parse(head()).entries).toHaveLength(1))
    expect(g.navigated).toHaveLength(1)
    expect(g.drive.files.size).toBe(1)
  })

  it('a backup much smaller than the one in Drive keeps that one and says so (#113)', async () => {
    for (let i = 0; i < 20; i++) await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }], note: `voce ${i}` })
    start(g.signIn('backup'))
    await screen.findByText('Backup su Drive fatto')
    const big = [...g.drive.files.values()][0].revs.at(-1)!
    clock += MIN
    await db.entries.clear()
    dismissToast()
    await fireEvent.click(within(card()).getByRole('button', { name: 'Backup su Drive' }))
    const when = new Intl.DateTimeFormat('it', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(big.modifiedTime))
    expect(await screen.findByText(`Backup su Drive fatto. Quello del ${when} era più grande: resta in Ripristina da Drive.`)).toBeInTheDocument()
    expect(big.keepForever).toBe(true)
  })

  it('says so when the person refuses on the consent screen', async () => {
    g.provider.connect('backup')
    history.replaceState(null, '', '/#error=access_denied&state=state1')
    start(g.provider.resume())
    expect(await within(card()).findByText('Accesso a Drive negato.')).toBeInTheDocument()
    expect(g.drive.calls).toEqual([])
  })

  it('stops on a newer backup in Drive and overwrites it only when asked, keeping it restorable', async () => {
    start(g.signIn('backup'))
    await screen.findByText('Backup su Drive fatto')
    clock += MIN
    const id = [...g.drive.files.keys()][0]
    g.drive.write(id, 'from the other phone')
    clock += MIN
    await fireEvent.click(within(card()).getByRole('button', { name: 'Backup su Drive' }))
    expect(await within(card()).findByText(/^Su Drive c'è un backup più recente di questo telefono/)).toBeInTheDocument()
    expect(head()).toBe('from the other phone')
    await fireEvent.click(within(card()).getByRole('button', { name: 'Sovrascrivi' }))
    await waitFor(() => expect(JSON.parse(head()).app).toBe('gom-jabbar'))
    expect(g.drive.pinned().map((r) => r.content)).toContain('from the other phone')
    expect(within(card()).queryByText(/^Su Drive c'è/)).not.toBeInTheDocument()
  })

  it('restores a version from Drive through the import preview', async () => {
    const entry = await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }], note: 'da Drive' })
    g.signIn()
    expect((await g.provider.put(JSON.stringify(await buildExport()))).ok).toBe(true)
    await db.entries.delete(entry.id)
    clock += MIN
    start(g.signIn('restore'))
    const sheet = await screen.findByRole('dialog', { name: 'Ripristina da Drive' })
    const points = within(sheet).getAllByRole('button', { name: /kB/ })
    expect(points).toHaveLength(1)
    expect(points[0]).toHaveTextContent('attuale')
    await fireEvent.click(points[0])
    const preview = await screen.findByRole('dialog', { name: 'Ripristina' })
    expect(preview).toHaveTextContent('1 voce nel file')
    await fireEvent.click(within(preview).getByRole('button', { name: 'Unisci ai dati attuali' }))
    await waitFor(async () => expect((await db.entries.get(entry.id))?.note).toBe('da Drive'))
  })

  it('the preview a restore point opens stays open: the points sheet gives its step back first', async () => {
    const entry = await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    g.signIn()
    expect((await g.provider.put(JSON.stringify(await buildExport()))).ok).toBe(true)
    await db.entries.delete(entry.id)
    clock += MIN
    start(g.signIn('restore'))
    const sheet = await screen.findByRole('dialog', { name: 'Ripristina da Drive' })
    await fireEvent.click(within(sheet).getAllByRole('button', { name: /kB/ })[0])
    await screen.findByRole('dialog', { name: 'Ripristina' })
    await new Promise((r) => setTimeout(r, 150))
    expect(screen.getByRole('dialog', { name: 'Ripristina' })).toBeInTheDocument()
    // Back closes the preview, and only the preview.
    history.back()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: 'Impostazioni' })).toBeInTheDocument()
  })

  it('says when Drive holds nothing to restore', async () => {
    start(g.signIn('restore'))
    const sheet = await screen.findByRole('dialog', { name: 'Ripristina da Drive' })
    expect(within(sheet).getByText('Nessun backup su Drive.')).toBeInTheDocument()
  })

  it('leaves for Google when restoring without a token', async () => {
    await openSettings()
    await fireEvent.click(within(card()).getByRole('button', { name: 'Ripristina da Drive' }))
    expect(g.navigated).toHaveLength(1)
    expect(localStorage.getItem('gj.drive')).toContain('"intent":"restore"')
  })

  it('rejects a restore point that is not a backup like any bad file', async () => {
    g.signIn()
    await g.provider.put('not a backup')
    start(g.signIn('restore'))
    const sheet = await screen.findByRole('dialog', { name: 'Ripristina da Drive' })
    await fireEvent.click(within(sheet).getAllByRole('button', { name: /kB/ })[0])
    expect(await screen.findByText('File non valido')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Ripristina' })).not.toBeInTheDocument()
  })

  it('disconnects: forgets the token and the account here, revokes the grant, leaves the file', async () => {
    start(g.signIn('backup'))
    await screen.findByText('Backup su Drive fatto')
    await fireEvent.click(within(card()).getByRole('button', { name: 'Scollega' }))
    expect(await screen.findByText('Drive scollegato')).toBeInTheDocument()
    expect(within(card()).getByText(/^Non collegato/)).toBeInTheDocument()
    expect(within(card()).queryByText(/^Account:/)).not.toBeInTheDocument()
    expect(within(card()).queryByRole('button', { name: 'Scollega' })).not.toBeInTheDocument()
    expect(g.drive.revoked).toEqual(['tok'])
    expect(g.drive.files.size).toBe(1)
  })

  it('disconnecting after the hour Google grants forgets the access here, and says the permission stays with Google', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    start(g.signIn('backup'))
    await screen.findByText('Backup su Drive fatto')
    clock += 61 * MIN
    await fireEvent.click(within(card()).getByRole('button', { name: 'Scollega' }))
    expect(await screen.findByText('Scollegato qui. Il permesso resta su Google')).toBeInTheDocument()
    expect(g.drive.revoked).toEqual([])
    expect(within(card()).getByText(/^Non collegato/)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Rimuovi' }))
    expect(open).toHaveBeenCalledWith('https://myaccount.google.com/permissions', '_blank', 'noopener')
  })

  it('names what went wrong in one line', async () => {
    g.drive.failures.push({ match: /GET .*files/, network: true })
    start(g.signIn('backup'))
    expect(await within(card()).findByText('Rete assente o instabile.')).toBeInTheDocument()
    g.drive.failures.push({ match: /POST .*files/, status: 500 })
    await fireEvent.click(within(card()).getByRole('button', { name: 'Backup su Drive' }))
    expect(await within(card()).findByText('Drive ha risposto con un errore (500).')).toBeInTheDocument()
    g.drive.failures.push({ match: /GET .*files/, status: 401 })
    await fireEvent.click(within(card()).getByRole('button', { name: 'Ripristina da Drive' }))
    expect(await within(card()).findByText('Accesso scaduto: tocca di nuovo.')).toBeInTheDocument()
    expect(within(card()).getByText(/^Non collegato/)).toBeInTheDocument()
  })

  it('names a failed download too, and keeps the list open', async () => {
    g.signIn()
    await g.provider.put('{}')
    start(g.signIn('restore'))
    const sheet = await screen.findByRole('dialog', { name: 'Ripristina da Drive' })
    g.drive.failures.push({ match: /GET .*files\/f/, network: true })
    await fireEvent.click(within(sheet).getAllByRole('button', { name: /kB/ })[0])
    expect(await within(card()).findByText('Rete assente o instabile.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Ripristina da Drive' })).toBeInTheDocument()
  })
})
