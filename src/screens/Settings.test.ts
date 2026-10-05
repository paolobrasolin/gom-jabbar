import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tick } from 'svelte'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { LEG_IDS, REGION_BY_ID, pathFor, shapeOf } from '../lib/regions'
import { addPreset } from '../lib/presets'
import { addEntry } from '../lib/entries'
import { buildExport } from '../lib/backup'
import { toastState } from '../lib/toast.svelte'
import { go, back } from '../test/nav'
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
  await go('Impostazioni')
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

describe('Settings about', () => {
  const [version, build] = __APP_VERSION__.split('+')
  const day = (lang: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${__APP_DATE__}T12:00:00`))

  it('has no help card: what needs explaining gets redesigned instead (§10)', async () => {
    await openSettings()
    expect(screen.queryByText('Come si usa')).not.toBeInTheDocument()
    // The card promised undo on every edit and named controls that are gone («+ Altra zona», long press on a limb).
    expect(document.body).not.toHaveTextContent('Altra zona')
    expect(document.body).not.toHaveTextContent('Tieni premuta')
  })

  it('ends with the version, its release date and the build, then the three pages and a way to reach the author', async () => {
    await openSettings()
    const about = screen.getByRole('contentinfo')
    expect(about).toHaveTextContent(`Gom Jabbar ${version} · ${day('it-IT')} · ${build}`)
    const link = (name: string) => within(about).getByRole('link', { name })
    // In Italian each page opens at its Italian part.
    expect(link('Informativa sulla privacy')).toHaveAttribute('href', '/privacy-policy.html#it')
    expect(link("Termini d'uso")).toHaveAttribute('href', '/terms-of-service.html#it')
    expect(link('Licenze open source')).toHaveAttribute('href', '/open-source-licences.html#it')
    expect(link('paolo.brasolin@gmail.com')).toHaveAttribute('href', 'mailto:paolo.brasolin@gmail.com')
    expect(link('Codice sorgente')).toHaveAttribute('href', 'https://github.com/paolobrasolin/gom-jabbar')
    for (const a of within(about).getAllByRole('link')) expect(a).not.toHaveAttribute('target')
    // Who and where first, then the three pages.
    expect([...about.querySelectorAll('p')].map((p) => p.textContent!.split(' · ')[0].trim())).toEqual([`Gom Jabbar ${version}`, 'paolo.brasolin@gmail.com', 'Informativa sulla privacy'])
  })

  it('opens the pages at the top, in English, when the app is in English', async () => {
    prefs.lang = 'en'
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
    const about = screen.getByRole('contentinfo')
    expect(about).toHaveTextContent(`Gom Jabbar ${version} · ${day('en-GB')} · ${build}`)
    expect(within(about).getByRole('link', { name: 'Terms of service' })).toHaveAttribute('href', '/terms-of-service.html')
    expect(within(about).getByRole('link', { name: 'Open source licences' })).toHaveAttribute('href', '/open-source-licences.html')
    expect(within(about).getByRole('link', { name: 'Source code' })).toBeInTheDocument()
  })
})

describe('Settings storage (#115)', () => {
  const NOTE = 'Il browser può cancellare i dati: fai spesso un backup.'
  const stub = (persisted: (() => Promise<boolean>) | undefined) =>
    vi.stubGlobal('navigator', { ...navigator, storage: { persist: async () => false, ...(persisted ? { persisted } : {}) } })

  it('says so in the Backup card when the browser did not agree to keep the data', async () => {
    stub(async () => false)
    await openSettings()
    const card = screen.getByRole('region', { name: 'Backup' })
    expect(await within(card).findByText(NOTE)).toBeInTheDocument()
  })

  /** The browser's answer, given once asked: the card took it before this test does, then Svelte renders. */
  function answering(answer: Promise<boolean>) {
    answer.catch(() => {})
    const persisted = vi.fn(() => answer)
    stub(persisted)
    return async () => {
      await waitFor(() => expect(persisted).toHaveBeenCalled())
      await answer.catch(() => {})
      await tick()
    }
  }

  it('says nothing when it agreed, or cannot tell', async () => {
    let answered = answering(Promise.resolve(true))
    await openSettings()
    await answered()
    expect(screen.getByRole('region', { name: 'Backup' })).not.toHaveTextContent(NOTE)
    // Without the question there is nothing to wait for.
    await back()
    stub(undefined)
    await go('Impostazioni')
    expect(screen.getByRole('region', { name: 'Backup' })).not.toHaveTextContent(NOTE)
    // A browser that fails to answer says nothing either.
    await back()
    answered = answering(Promise.reject(new Error('no')))
    await go('Impostazioni')
    await answered()
    expect(screen.getByRole('region', { name: 'Backup' })).not.toHaveTextContent(NOTE)
  })
})

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
    // It names what is on screen now (#37): the Preset dropdown on the log, not a screen called Registra or a + chip.
    expect(await screen.findByText('Nessun preset. Sulla schermata iniziale apri «Preset» e tocca «Nuovo preset».')).toBeInTheDocument()
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

  it('editing a preset while a symptom it asks is off keeps asking it (#115)', async () => {
    const p = await addPreset({ name: 'Gambe', layers: [{ regions: LEG_IDS, asks: ['pain', 'swelling'] }], kind: 'chronic' })
    await db.symptoms.update('swelling', { enabled: false })
    await openSettings()
    await fireEvent.click(await screen.findByRole('button', { name: 'Modifica Gambe' }))
    const form = await screen.findByRole('dialog', { name: 'Modifica preset' })
    const asks = within(form).getByRole('group', { name: 'Chiede' })
    // Off, it is not offered; nothing else changes.
    expect(await within(asks).findByRole('button', { name: 'Dolore' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(asks).queryByRole('button', { name: 'Gonfiore' })).not.toBeInTheDocument()
    await fireEvent.input(within(form).getByRole('textbox', { name: 'Nome del preset' }), { target: { value: 'Gambe pesanti' } })
    await fireEvent.click(within(form).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect((await db.presets.get(p.id))?.name).toBe('Gambe pesanti'))
    expect((await db.presets.get(p.id))?.layers[0].asks).toEqual(['pain', 'swelling'])
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
    expect(within(form).getByText('Nessuna zona: tocca la figura')).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
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
    await go('Impostazioni')
    const male = await screen.findByRole('button', { name: 'Maschile' })
    expect(screen.getByRole('button', { name: 'Femminile' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(male)
    expect(prefs.figure).toBe('male')
    expect(JSON.parse(localStorage.getItem('gj.prefs')!).figure).toBe('male')
    await back()
    await screen.findByRole('group', { name: 'Davanti' })
    // The stage draws the male polygons now.
    expect(document.querySelector('.region[data-region="152"]')!.getAttribute('d')).toBe(pathFor(shapeOf('male', REGION_BY_ID['152'])))
    // Same regions on either figure: the thigh is still there to tap.
    expect(screen.getByRole('button', { name: 'Coscia sx' })).toBeInTheDocument()
    await go('Impostazioni')
    await fireEvent.click(await screen.findByRole('button', { name: 'Femminile' }))
    expect(prefs.figure).toBe('female')
  })

  it('shows the count of entries and the build version', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    await openSettings()
    expect(await screen.findByText(/1 voce\b/)).toBeInTheDocument()
  })
})

describe('Settings backup', () => {
  it('shares the JSON backup and records the date', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }], note: 'ciao' })
    const shared = stubShare()
    await openSettings()
    expect(screen.getByText('Nessun backup ancora fatto.')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Backup su file' }))
    await waitFor(() => expect(shared).toHaveLength(1))
    expect(shared[0].name).toMatch(/^gom-jabbar-\d{8}\.json$/)
    expect(shared[0].type).toBe('application/json')
    const file = JSON.parse(await readFile(shared[0]))
    expect(file.app).toBe('gom-jabbar')
    expect(file.entries).toHaveLength(1)
    expect(file.entries[0].note).toBe('ciao')
    expect(file.vocabulary.symptoms).toHaveLength(9)
    expect(await screen.findByText('Backup su file fatto')).toBeInTheDocument()
    expect(prefs.lastBackupAt).not.toBeNull()
    expect(localStorage.getItem('gj.prefs')).toContain('"lastBackupAt":"')
    expect(screen.getByText(/^Ultimo backup: /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Backup su file' })).toBeEnabled()
  })

  it('offers the backup as .txt when the share sheet refuses JSON', async () => {
    const shared = stubShare((f) => f.type === 'text/plain')
    await openSettings()
    await fireEvent.click(screen.getByRole('button', { name: 'Backup su file' }))
    await waitFor(() => expect(shared).toHaveLength(1))
    expect(shared[0].name).toMatch(/^gom-jabbar-\d{8}\.txt$/)
    expect(JSON.parse(await readFile(shared[0])).app).toBe('gom-jabbar')
  })

  it('downloads the file when the browser cannot share', async () => {
    let downloaded = ''
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download
    })
    await openSettings()
    await fireEvent.click(screen.getByRole('button', { name: 'Backup su file' }))
    await waitFor(() => expect(downloaded).toMatch(/^gom-jabbar-\d{8}\.json$/))
    expect(await screen.findByText('Backup su file fatto')).toBeInTheDocument()
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
    await fireEvent.click(screen.getByRole('button', { name: 'Backup su file' }))
    await waitFor(() => expect(downloaded).toMatch(/\.json$/))
    await screen.findByText('Backup su file fatto')
    prefs.lastBackupAt = null

    create.mockImplementation(() => { throw new TypeError('no blobs here') })
    await fireEvent.click(screen.getByRole('button', { name: 'Backup su file' }))
    expect((await screen.findByText('Backup non riuscito')).closest('.toast')).toHaveClass('failure')
    expect(prefs.lastBackupAt).toBeNull()
  })

  it('stays quiet when the share sheet is dismissed', async () => {
    stubShare(() => true, async () => { throw new DOMException('cancelled', 'AbortError') })
    await openSettings()
    await fireEvent.click(screen.getByRole('button', { name: 'Backup su file' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Backup su file' })).toBeEnabled())
    expect(document.querySelector('.toast')).toBeNull()
    expect(prefs.lastBackupAt).toBeNull()
  })
})

describe('Settings import', () => {
  it('says a file from a newer version needs the app updated, and opens nothing', async () => {
    await openSettings()
    await pickFile(JSON.stringify({ app: 'gom-jabbar', version: 99, entries: [] }))
    expect((await screen.findByText("File di una versione più nuova: aggiorna l'app")).closest('.toast')).toHaveClass('refusal')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('rejects a file that is not a backup', async () => {
    await openSettings()
    await pickFile('{"hello": 1}')
    expect((await screen.findByText('File non valido')).closest('.toast')).toHaveClass('refusal')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a restored file is a backup: the last backup becomes its date, unless a later one is known', async () => {
    await addEntry({ at: '2026-09-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    const file = await buildExport()
    file.exportedAt = new Date(Date.now() - 2 * 86_400_000).toISOString()
    prefs.lastBackupAt = null
    await openSettings()
    await pickFile(JSON.stringify(file))
    await fireEvent.click(within(await screen.findByRole('dialog', { name: 'Ripristina' })).getByRole('button', { name: /Sostituisci tutto/ }))
    await waitFor(() => expect(prefs.lastBackupAt).toBe(file.exportedAt))
    // An older file says nothing new about the last backup.
    const later = new Date(Date.now() - 86_400_000).toISOString()
    prefs.lastBackupAt = later
    await pickFile(JSON.stringify(file))
    await fireEvent.click(within(await screen.findByRole('dialog', { name: 'Ripristina' })).getByRole('button', { name: 'Unisci ai dati attuali' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(prefs.lastBackupAt).toBe(later)
  })

  it('previews the file and merges it into the current data', async () => {
    const mine = await addEntry({ at: '2026-09-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    const other = await addEntry({ at: '2026-09-02T10:00:00.000Z', layers: [{ regions: ['153'], readings: { pain: 6 } }] })
    const file = await buildExport()
    // A local time: west of UTC−8 the instant 08:00Z is still the 9th.
    file.exportedAt = new Date(2026, 8, 10, 8).toISOString()
    await db.entries.delete(other.id)
    await openSettings()
    await pickFile(JSON.stringify(file))
    const sheet = await screen.findByRole('dialog', { name: 'Ripristina' })
    expect(sheet).toHaveTextContent('2 voci nel file del 10 set 2026.')
    // Missing here may mean deleted here since that backup: a merge brings it back, and the preview says so (#113).
    expect(sheet).toHaveTextContent('Unendo: 1 che qui manca (anche se cancellata), 0 aggiornate.')
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Unisci ai dati attuali' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(2))
    expect((await db.entries.get(mine.id))?.layers[0].readings.pain).toBe(4)
    expect(await screen.findByText('Ripristinata 1 voce')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // A merge is undone like a replace (#113): from the copy it kept of the diary before it.
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect((await db.entries.toArray()).map((e) => e.id)).toEqual([mine.id]))
  })

  it('replaces everything, with undo', async () => {
    const other = await addEntry({ at: '2026-09-02T10:00:00.000Z', layers: [{ regions: ['153'], readings: { pain: 6 } }] })
    const file = await buildExport()
    await db.entries.delete(other.id)
    const mine = await addEntry({ at: '2026-09-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    await openSettings()
    await pickFile(JSON.stringify(file))
    const sheet = await screen.findByRole('dialog', { name: 'Ripristina' })
    const replace = await within(sheet).findByRole('button', { name: /^Sostituisci tutto/ })
    await waitFor(() => expect(replace).toHaveTextContent('Sostituisci tutto (1 voce attuale)'))
    await fireEvent.click(replace)
    await waitFor(async () => expect((await db.entries.toArray()).map((e) => e.id)).toEqual([other.id]))
    expect(await screen.findByText('Ripristinata 1 voce')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect((await db.entries.toArray()).map((e) => e.id)).toEqual([mine.id]))
    expect(await db.symptoms.count()).toBe(9)
  })

  it('Sostituisci tutto replaces the presets too, and its undo brings back the ones only this phone had', async () => {
    const theirs = await addPreset({ name: 'Schiena', layers: [{ regions: [], asks: ['pain'] }], kind: 'chronic' })
    const file = await buildExport()
    await db.presets.delete(theirs.id)
    const mine = await addPreset({ name: 'Gambe', layers: [{ regions: ['152'], asks: ['pain'] }], kind: 'chronic' })
    await openSettings()
    await pickFile(JSON.stringify(file))
    await fireEvent.click(within(await screen.findByRole('dialog', { name: 'Ripristina' })).getByRole('button', { name: /^Sostituisci tutto/ }))
    expect(await screen.findByText('Ripristinate 0 voci')).toBeInTheDocument()
    expect(await db.presets.toArray()).toEqual([theirs])
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.presets.toArray()).toEqual([mine]))
  })

  /**
   * A restore of two new entries, started now through the same sheet: whatever a tap before it set off has shown its
   * toast by the time this one says "Ripristinate 2 voci", which no second tap can say. Returns that toast's id.
   */
  async function restoreTwo(button: string) {
    const file = await buildExport()
    const two = ['fence-1', 'fence-2'].map((id) => ({ ...file.entries[0], id }))
    await pickFile(JSON.stringify({ ...file, entries: two }))
    await fireEvent.click(within(await screen.findByRole('dialog', { name: 'Ripristina' })).getByRole('button', { name: new RegExp(`^${button}`) }))
    await waitFor(() => expect(toastState.current?.message).toBe('Ripristinate 2 voci'))
    return toastState.current!.id
  }

  it('a double tap on Sostituisci tutto replaces once and keeps the undo', async () => {
    const other = await addEntry({ at: '2026-09-02T10:00:00.000Z', layers: [{ regions: ['153'], readings: { pain: 6 } }] })
    const file = await buildExport()
    await db.entries.delete(other.id)
    const mine = await addEntry({ at: '2026-09-01T10:00:00.000Z', layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    await openSettings()
    // The second tap lands while the first is in flight. Unguarded, depending on the gap, it failed on the emptied
    // preview after the replace went through ("Ripristino non riuscito", no undo), or took its undo copy after it.
    // With no gap both taps come before Svelte disables the button: only the guard in doImport stops the second.
    for (const gap of [null, 0, 1, 2, 3, 5]) {
      await pickFile(JSON.stringify(file))
      const sheet = await screen.findByRole('dialog', { name: 'Ripristina' })
      const replace = await within(sheet).findByRole('button', { name: /^Sostituisci tutto/ })
      replace.click()
      if (gap !== null) await new Promise((r) => setTimeout(r, gap))
      replace.click()
      await waitFor(() => expect(toastState.current?.message).toBe('Ripristinata 1 voce'))
      const done = toastState.current!.id
      await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
      await waitFor(async () => expect((await db.entries.toArray()).map((e) => e.id)).toEqual([mine.id]))
      // The toast right after that one is the next restore's: the second tap showed none.
      expect(await restoreTwo('Sostituisci tutto')).toBe(done + 1)
      await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
      await waitFor(async () => expect((await db.entries.toArray()).map((e) => e.id)).toEqual([mine.id]))
    }
  })

  it('a double tap on Unisci merges once, with no failure message', async () => {
    const other = await addEntry({ at: '2026-09-02T10:00:00.000Z', layers: [{ regions: ['153'], readings: { pain: 6 } }] })
    const file = await buildExport()
    await db.entries.delete(other.id)
    await openSettings()
    await pickFile(JSON.stringify(file))
    const sheet = await screen.findByRole('dialog', { name: 'Ripristina' })
    const merge = within(sheet).getByRole('button', { name: 'Unisci ai dati attuali' })
    // Both taps before Svelte disables the button: only the guard in doImport stops the second.
    merge.click()
    merge.click()
    await waitFor(() => expect(toastState.current?.message).toBe('Ripristinata 1 voce'))
    const done = toastState.current!.id
    expect(await db.entries.count()).toBe(1)
    // The toast right after that one is the next restore's: no "Ripristinate 0 voci" from a second merge of the same file.
    expect(await restoreTwo('Unisci ai dati attuali')).toBe(done + 1)
  })

  it('does nothing when the picker is cancelled', async () => {
    await openSettings()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await fireEvent.change(input, { target: { files: [] } })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('.toast')).toBeNull()
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
