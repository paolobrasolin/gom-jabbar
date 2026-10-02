/** The copies the app keeps of the diary (§4.1, §6.4, #113): listed in Settings, restored or downloaded from there. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addEntry, deleteEntry } from '../lib/entries'
import { takeSnapshot } from '../lib/snapshots'
import { parseImport } from '../lib/backup'
import { go } from '../test/nav'
import App from '../App.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  localStorage.clear()
  prefs.lang = 'it'
  prefs.lastBackupAt = null
  prefs.backupSnoozedUntil = null
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function openSettings() {
  render(App)
  await go('Impostazioni')
}
const readFile = (f: Blob) =>
  new Promise<string>((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.readAsText(f)
  })
const when = (iso: string) => new Intl.DateTimeFormat('it', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const day = (iso: string) => new Intl.DateTimeFormat('it', { dateStyle: 'medium' }).format(new Date(iso))
const copies = () => screen.getByRole('group', { name: 'Copie automatiche' })

/** The diary had "prima"; an upgrade kept it; now it has "dopo" instead. */
async function upgraded() {
  const first = await addEntry({ at: '2026-09-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 4 } }], note: 'prima' })
  const snap = await takeSnapshot('upgrade')
  await deleteEntry(first.id)
  await addEntry({ at: '2026-09-02T10:00:00.000Z', layers: [{ regions: ['153'], readings: { pain: 6 } }], note: 'dopo' })
  return snap
}

describe('the copies the app keeps', () => {
  it('none kept, nothing shown', async () => {
    await openSettings()
    expect(screen.queryByRole('group', { name: 'Copie automatiche' })).toBeNull()
  })

  it('an upgrade’s copy is listed and restores through the Ripristina sheet; restoring it is no backup', async () => {
    const snap = await upgraded()
    await openSettings()
    const row = (await within(await screen.findByRole('group', { name: 'Copie automatiche' })).findByText(`Prima dell'aggiornamento · ${when(snap.takenAt)}`)).closest('.row') as HTMLElement
    await fireEvent.click(within(row).getByRole('button', { name: 'Ripristina' }))
    const sheet = await screen.findByRole('dialog', { name: 'Ripristina' })
    expect(sheet).toHaveTextContent(`1 voce nella copia del ${day(snap.takenAt)}.`)
    await fireEvent.click(within(sheet).getByRole('button', { name: /^Sostituisci tutto/ }))
    await waitFor(async () => expect((await db.entries.toArray()).map((e) => e.note)).toEqual(['prima']))
    // A copy that never left the phone: the banner still asks for a backup.
    expect(prefs.lastBackupAt).toBeNull()
  })

  it('a copy downloads as a backup file, which is no backup either', async () => {
    const snap = await upgraded()
    const shared: File[] = []
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: async (d: ShareData) => void shared.push(...(d.files as File[])) })
    await openSettings()
    await fireEvent.click(within(await screen.findByRole('group', { name: 'Copie automatiche' })).getByRole('button', { name: 'Ripristina' }))
    const sheet = await screen.findByRole('dialog', { name: 'Ripristina' })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Scarica come file' }))
    await waitFor(() => expect(shared).toHaveLength(1))
    expect(shared[0].name).toMatch(/^gom-jabbar-copia-\d{8}\.json$/)
    const file = parseImport(await readFile(shared[0]))
    expect(file.exportedAt).toBe(snap.takenAt)
    expect(file.entries.map((e) => e.note)).toEqual(['prima'])
    expect(await screen.findByText('Copia scaricata')).toBeInTheDocument()
    expect(prefs.lastBackupAt).toBeNull()
    expect(copies()).toBeInTheDocument()
  })

  it('a file picked from the phone has no download button: it is a file already', async () => {
    await upgraded()
    await openSettings()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const text = JSON.stringify((await takeSnapshot('upgrade')).file)
    await fireEvent.change(input, { target: { files: [Object.assign(new File([text], 'b.json'), { text: async () => text })] } })
    const sheet = await screen.findByRole('dialog', { name: 'Ripristina' })
    expect(sheet).toHaveTextContent('nel file del')
    expect(within(sheet).queryByRole('button', { name: 'Scarica come file' })).toBeNull()
  })
})
