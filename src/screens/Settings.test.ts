import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { figureBox, LEG_IDS } from '../lib/regions'
import { addPreset } from '../lib/presets'
import { addEntry } from '../lib/entries'
import { buildExport } from '../lib/backup'
import App from '../App.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  localStorage.clear()
  prefs.lang = 'it'
  prefs.theme = 'system'
  prefs.lastBackupAt = null
  prefs.backupSnoozedUntil = null
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function openSettings() {
  render(App)
  await fireEvent.click(screen.getByRole('button', { name: 'Impostazioni' }))
}
const readFile = (f: Blob) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error)
    fr.readAsText(f)
  })
/** Pretend to be a share sheet; `accept` decides which candidate file it takes. */
function stubShare(accept: (f: File) => boolean = () => true, share?: (d: ShareData) => Promise<void>) {
  const shared: File[] = []
  vi.stubGlobal('navigator', {
    ...navigator,
    canShare: (d: ShareData) => accept((d.files as File[])[0]),
    share: share ?? (async (d: ShareData) => void shared.push(...(d.files as File[]))),
  })
  return shared
}
/** Hand a JSON text to the hidden import input as if the user had picked a file. jsdom's File lacks `text()`. */
async function pickFile(text: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = Object.assign(new File([text], 'backup.json', { type: 'application/json' }), { text: async () => text })
  await fireEvent.change(input, { target: { files: [file] } })
}

describe('Settings presets', () => {
  it('lists presets and deletes with undo', async () => {
    await addPreset({ name: 'Schiena', layers: [{ regions: [], asks: ['pain'] }], kind: 'chronic' })
    await openSettings()
    await screen.findByText('Schiena')
    await fireEvent.click(screen.getByRole('button', { name: 'Elimina Schiena' }))
    await waitFor(async () => expect(await db.presets.count()).toBe(0))
    await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.presets.count()).toBe(1))
  })

  it('explains how to create the first preset', async () => {
    await openSettings()
    expect(await screen.findByText(/Nessun preset.*Nuovo preset/)).toBeInTheDocument()
  })

  it('edits a preset in place: same id, new name and shape, undo restores', async () => {
    const p = await addPreset({ name: 'Schiena', layers: [{ regions: ['224'], asks: ['pain'] }, { regions: LEG_IDS, asks: ['pain', 'swelling'] }], kind: 'chronic' })
    await addEntry({ layers: [{ regions: ['224'], readings: { pain: 3 }, tags: [] }], presetId: p.id })
    await openSettings()
    await fireEvent.click(await screen.findByRole('button', { name: 'Modifica Schiena' }))
    const form = await screen.findByRole('dialog', { name: 'Modifica preset' })
    const name = within(form).getByRole('textbox', { name: 'Nome del preset' })
    expect(name).toHaveValue('Schiena')
    const asks = within(form).getByRole('group', { name: 'Chiede' })
    expect(await within(asks).findByRole('button', { name: 'Dolore' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(asks).getByRole('button', { name: 'Gonfiore' })).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.input(name, { target: { value: 'Dorso' } })
    await fireEvent.click(within(asks).getByRole('button', { name: 'Gonfiore' }))
    // Chiede follows the layer: the legs already ask for swelling; drop pain there.
    const chips = form.querySelectorAll<HTMLButtonElement>('.chips.areas .area')
    expect(chips).toHaveLength(2)
    await fireEvent.click(chips[1])
    expect(within(asks).getByRole('button', { name: 'Gonfiore' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(asks).getByRole('button', { name: 'Dolore' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(within(asks).getByRole('button', { name: 'Dolore' }))
    await fireEvent.click(within(form).getByRole('button', { name: 'Episodio' }))
    await fireEvent.click(within(form).getByRole('button', { name: 'Salva' }))
    expect(await screen.findByText('Preset salvato')).toBeInTheDocument()
    await waitFor(async () => expect((await db.presets.get(p.id))?.name).toBe('Dorso'))
    expect(await db.presets.get(p.id)).toEqual({ id: p.id, order: 0, name: 'Dorso', kind: 'episode', layers: [{ regions: ['224'], asks: ['pain', 'swelling'] }, { regions: [...LEG_IDS].sort(), asks: ['swelling'] }] })
    expect(await screen.findByText('Dorso')).toBeInTheDocument()
    // The entry logged from it still belongs to it.
    expect((await db.entries.toArray())[0].presetId).toBe(p.id)
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.presets.get(p.id)).toMatchObject({ name: 'Schiena', kind: 'chronic', layers: [{ regions: ['224'], asks: ['pain'] }, { regions: LEG_IDS, asks: ['pain', 'swelling'] }] }))
  })

  it('saving the form of a preset deleted meanwhile changes nothing', async () => {
    const p = await addPreset({ name: 'Schiena', layers: [{ regions: ['224'], asks: ['pain'] }], kind: 'chronic' })
    await openSettings()
    await fireEvent.click(await screen.findByRole('button', { name: 'Modifica Schiena' }))
    const form = await screen.findByRole('dialog', { name: 'Modifica preset' })
    await within(within(form).getByRole('group', { name: 'Chiede' })).findByRole('button', { name: 'Dolore' })
    await db.presets.delete(p.id)
    await fireEvent.click(within(form).getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Modifica preset' })).not.toBeInTheDocument())
    expect(screen.queryByText('Preset salvato')).not.toBeInTheDocument()
    expect(await db.presets.count()).toBe(0)
  })

  it('a preset without a shape opens on the empty form and asks for every symptom', async () => {
    await addPreset({ name: 'Vago', layers: [{ regions: [], asks: ['fog'] }], kind: 'chronic' })
    await openSettings()
    await fireEvent.click(await screen.findByRole('button', { name: 'Modifica Vago' }))
    const form = await screen.findByRole('dialog', { name: 'Modifica preset' })
    expect(within(form).getByText('Nessuna zona: tocca le figure')).toBeInTheDocument()
    const asks = within(form).getByRole('group', { name: 'Chiede' })
    expect(await within(asks).findByRole('button', { name: 'Nebbia mentale' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(asks).getByRole('button', { name: 'Dolore' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(form).getByRole('button', { name: 'Salva' })).toBeEnabled()
  })
})

describe('Settings preferences', () => {
  it('nudges to install while running in a browser tab', async () => {
    await openSettings()
    expect(screen.getByText(/Aggiungi alla schermata Home per usarla offline/)).toBeInTheDocument()
  })

  it('hides the install hint once installed', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(display-mode: standalone)', addEventListener() {}, removeEventListener() {} }))
    await openSettings()
    expect(screen.queryByText(/Aggiungi alla schermata Home per usarla offline/)).not.toBeInTheDocument()
  })

  it('switches the language everywhere and remembers it', async () => {
    await openSettings()
    expect(screen.getByRole('button', { name: 'Italiano' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(prefs.lang).toBe('en')
    expect(localStorage.getItem('gj.prefs')).toContain('"lang":"en"')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    await fireEvent.click(screen.getByRole('button', { name: 'Italiano' }))
    expect(prefs.lang).toBe('it')
    expect(screen.getByText('Lingua')).toBeInTheDocument()
  })

  it('switches the theme and stamps it on the document', async () => {
    await openSettings()
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    await fireEvent.click(screen.getByRole('button', { name: 'Scuro' }))
    expect(prefs.theme).toBe('dark')
    expect(localStorage.getItem('gj.prefs')).toContain('"theme":"dark"')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', { name: 'Scuro' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Chiaro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    await fireEvent.click(screen.getByRole('button', { name: 'Sistema' }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('switches the figure the body map draws and remembers it', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Impostazioni' }))
    const male = await screen.findByRole('button', { name: 'Maschile' })
    expect(screen.getByRole('button', { name: 'Femminile' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(male)
    expect(prefs.figure).toBe('male')
    expect(JSON.parse(localStorage.getItem('gj.prefs')!).figure).toBe('male')
    await fireEvent.click(screen.getByRole('button', { name: 'Registra' }))
    const front = await screen.findByRole('group', { name: 'Davanti' })
    expect(front.getAttribute('viewBox')).toBe(`-4 -4 ${figureBox('male').w + 8} ${figureBox('male').h + 8}`)
    // Same regions on either figure: the thigh is still there to tap.
    expect(screen.getByRole('button', { name: 'Coscia sx' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Impostazioni' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Femminile' }))
    expect(prefs.figure).toBe('female')
  })

  it('shows the count of entries and the build version', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    await openSettings()
    expect(await screen.findByText(/1 voci/)).toBeInTheDocument()
    expect(screen.getByText(/^Versione \d+\.\d+\.\d+\+/)).toBeInTheDocument()
  })
})

describe('Settings backup', () => {
  it('shares the JSON backup and records the date', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }], note: 'ciao' })
    const shared = stubShare()
    await openSettings()
    expect(screen.getByText('Nessun backup ancora fatto.')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Esporta backup' }))
    await waitFor(() => expect(shared).toHaveLength(1))
    expect(shared[0].name).toMatch(/^gom-jabbar-\d{8}\.json$/)
    expect(shared[0].type).toBe('application/json')
    const file = JSON.parse(await readFile(shared[0]))
    expect(file.app).toBe('gom-jabbar')
    expect(file.entries).toHaveLength(1)
    expect(file.entries[0].note).toBe('ciao')
    expect(file.vocabulary.symptoms).toHaveLength(9)
    expect(await screen.findByText('Backup esportato')).toBeInTheDocument()
    expect(prefs.lastBackupAt).not.toBeNull()
    expect(localStorage.getItem('gj.prefs')).toContain('"lastBackupAt":"')
    expect(screen.getByText(/^Ultimo backup: /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Esporta backup' })).toBeEnabled()
  })

  it('offers the backup as .txt when the share sheet refuses JSON', async () => {
    const shared = stubShare((f) => f.type === 'text/plain')
    await openSettings()
    await fireEvent.click(screen.getByRole('button', { name: 'Esporta backup' }))
    await waitFor(() => expect(shared).toHaveLength(1))
    expect(shared[0].name).toMatch(/^gom-jabbar-\d{8}\.txt$/)
    expect(JSON.parse(await readFile(shared[0])).app).toBe('gom-jabbar')
  })

  it('shares a CSV', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 }, tags: ['rest'] }] })
    const shared = stubShare()
    await openSettings()
    await fireEvent.click(screen.getByRole('button', { name: 'Esporta CSV' }))
    await waitFor(() => expect(shared).toHaveLength(1))
    expect(shared[0].name).toMatch(/^gom-jabbar-\d{8}\.csv$/)
    expect(shared[0].type).toBe('text/csv')
    const csv = await readFile(shared[0])
    expect(csv.startsWith('id,kind,at,episodeId,endedAt,presetId,pain,swelling')).toBe(true)
    expect(csv).toContain('152:pain=4:rest,gamba sx:pain=4,rest,Riposo')
    expect(prefs.lastBackupAt).toBeNull()
  })

  it('downloads the file when the browser cannot share', async () => {
    let downloaded = ''
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download
    })
    await openSettings()
    await fireEvent.click(screen.getByRole('button', { name: 'Esporta backup' }))
    await waitFor(() => expect(downloaded).toMatch(/^gom-jabbar-\d{8}\.json$/))
    expect(await screen.findByText('Backup esportato')).toBeInTheDocument()
  })

  it('falls back to a download when sharing fails, and complains when that fails too', async () => {
    let downloaded = ''
    stubShare(() => true, async () => { throw new Error('boom') })
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download
    })
    await openSettings()
    await fireEvent.click(screen.getByRole('button', { name: 'Esporta CSV' }))
    await waitFor(() => expect(downloaded).toMatch(/\.csv$/))

    create.mockImplementation(() => { throw new TypeError('no blobs here') })
    await fireEvent.click(screen.getByRole('button', { name: 'Esporta backup' }))
    expect(await screen.findByText('Esportazione non riuscita')).toBeInTheDocument()
    expect(prefs.lastBackupAt).toBeNull()
  })

  it('stays quiet when the share sheet is dismissed', async () => {
    stubShare(() => true, async () => { throw new DOMException('cancelled', 'AbortError') })
    await openSettings()
    await fireEvent.click(screen.getByRole('button', { name: 'Esporta backup' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Esporta backup' })).toBeEnabled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(prefs.lastBackupAt).toBeNull()
  })
})

describe('Settings import', () => {
  it('rejects a file that is not a backup', async () => {
    await openSettings()
    await pickFile('{"hello": 1}')
    expect(await screen.findByText('File non valido')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('previews the file and merges it into the current data', async () => {
    const mine = await addEntry({ at: '2026-09-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    const other = await addEntry({ at: '2026-09-02T10:00:00.000Z', layers: [{ regions: ['153'], readings: { pain: 6 } }] })
    const file = await buildExport()
    file.exportedAt = '2026-09-10T08:00:00.000Z'
    await db.entries.delete(other.id)
    await openSettings()
    await pickFile(JSON.stringify(file))
    const sheet = await screen.findByRole('dialog', { name: 'Importa' })
    expect(sheet).toHaveTextContent('2 voci nel file del 10 set 2026.')
    expect(sheet).toHaveTextContent('Unendo: 1 nuove, 0 aggiornate.')
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Unisci ai dati attuali' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(2))
    expect((await db.entries.get(mine.id))?.layers[0].readings.pain).toBe(4)
    expect(await screen.findByText('Importate 1 voci')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Annulla' })).not.toBeInTheDocument()
  })

  it('replaces everything, with undo', async () => {
    const other = await addEntry({ at: '2026-09-02T10:00:00.000Z', layers: [{ regions: ['153'], readings: { pain: 6 } }] })
    const file = await buildExport()
    await db.entries.delete(other.id)
    const mine = await addEntry({ at: '2026-09-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    await openSettings()
    await pickFile(JSON.stringify(file))
    const sheet = await screen.findByRole('dialog', { name: 'Importa' })
    const replace = await within(sheet).findByRole('button', { name: /^Sostituisci tutto/ })
    await waitFor(() => expect(replace).toHaveTextContent('Sostituisci tutto (1 voci attuali)'))
    await fireEvent.click(replace)
    await waitFor(async () => expect((await db.entries.toArray()).map((e) => e.id)).toEqual([other.id]))
    expect(await screen.findByText('Importate 1 voci')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect((await db.entries.toArray()).map((e) => e.id)).toEqual([mine.id]))
    expect(await db.symptoms.count()).toBe(9)
  })

  it('does nothing when the picker is cancelled', async () => {
    await openSettings()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await fireEvent.change(input, { target: { files: [] } })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Settings vocabulary', () => {
  it('opens the symptom and tag editors in a sheet', async () => {
    await openSettings()
    await fireEvent.click(screen.getByRole('button', { name: 'Sintomi' }))
    const symptoms = await screen.findByRole('dialog', { name: 'Sintomi' })
    expect(await within(symptoms).findByRole('checkbox', { name: 'Gonfiore' })).toBeInTheDocument()
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Tag' }))
    const tags = await screen.findByRole('dialog', { name: 'Tag' })
    expect(await within(tags).findByRole('checkbox', { name: 'Riposo' })).toBeInTheDocument()
    expect(tags).toHaveTextContent('Farmaci')
  })
})
