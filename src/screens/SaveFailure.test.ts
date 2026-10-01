/** A write or a read can fail (storage full, the database closed by the browser): it is said, never silent. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addEntry } from '../lib/entries'
import { addPreset } from '../lib/presets'
import { dismissToast, toastState } from '../lib/toast.svelte'
import { reads } from '../lib/live.svelte'
import { go, openEpisode, pickPreset, presetItem, salva } from '../test/nav'
import App from '../App.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
  history.replaceState(null, '', '/')
  dismissToast()
  reads.failed = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const full = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError')
const said = () => waitFor(() => expect(toastState.current).toMatchObject({ message: 'Non riuscito: riprova', kind: 'failure' }))

describe('a failed write', () => {
  it('stays until closed: a change of screen does not take it away (#94)', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '4' } })
    vi.spyOn(db.entries, 'add').mockRejectedValueOnce(full())
    await salva()
    await said()
    await go('Diario')
    expect(screen.getByRole('alert')).toHaveTextContent('Non riuscito: riprova')
    await fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Salva on the log: says so, keeps the draft, and the next Salva saves', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    vi.spyOn(db.entries, 'add').mockRejectedValueOnce(full())
    await salva()
    await said()
    expect(await db.entries.count()).toBe(0)
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'true')
    await new Promise((r) => setTimeout(r, 50))
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
  })

  it('Salva in the edit sheet: says so and keeps the sheet open with the edit', async () => {
    await addEntry({ at: ago(30), layers: [{ regions: ['152'], readings: { pain: 4 } }], note: 'prima' })
    render(App)
    await go('Diario')
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
    const sheet = await screen.findByRole('dialog', { name: 'Modifica' })
    await fireEvent.click(within(sheet).getByRole('button', { name: /^Altro/ }))
    await fireEvent.input(within(sheet).getByRole('textbox', { name: 'Note' }), { target: { value: 'dopo' } })
    vi.spyOn(db.entries, 'update').mockRejectedValueOnce(full())
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await said()
    expect(screen.getByRole('dialog', { name: 'Modifica' })).toBeInTheDocument()
    expect(within(sheet).getByRole('textbox', { name: 'Note' })).toHaveValue('dopo')
    expect((await db.entries.toArray())[0].note).toBe('prima')
  })

  it('Aggiorna and Termina in the episode sheet: say so and keep the sheet open', async () => {
    await addEntry({ at: ago(60), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 6 } }] })
    render(App)
    const sheet = await openEpisode()
    vi.spyOn(db.entries, 'add').mockRejectedValueOnce(full())
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await said()
    expect(screen.getByRole('dialog', { name: 'Episodio in corso' })).toBeInTheDocument()
    dismissToast()
    vi.spyOn(db.entries, 'update').mockRejectedValueOnce(full())
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Termina adesso' }))
    await said()
    expect(screen.getByRole('dialog', { name: 'Episodio in corso' })).toBeInTheDocument()
    expect((await db.entries.toArray())[0].endedAt).toBeNull()
  })

  it('a preset sheet and the preset form: say so and stay open', async () => {
    await addPreset({ name: 'Schiena', layers: [{ regions: ['224'], asks: ['pain'] }], kind: 'chronic' })
    render(App)
    await pickPreset(/Schiena/)
    const sheet = await screen.findByRole('dialog', { name: 'Schiena' })
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '3' } })
    vi.spyOn(db.entries, 'add').mockRejectedValueOnce(full())
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await said()
    expect(screen.getByRole('dialog', { name: 'Schiena' })).toBeInTheDocument()
    await fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    dismissToast()
    await fireEvent.click(await presetItem('Nuovo preset'))
    const form = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    await fireEvent.input(within(form).getByRole('textbox', { name: 'Nome del preset' }), { target: { value: 'Gambe' } })
    vi.spyOn(db.presets, 'add').mockRejectedValueOnce(full())
    await fireEvent.click(within(form).getByRole('button', { name: 'Crea preset' }))
    await said()
    expect(screen.getByRole('dialog', { name: 'Nuovo preset' })).toBeInTheDocument()
    expect(await db.presets.count()).toBe(1)
  })

  it('an undo that fails says so too', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    vi.spyOn(db.entries, 'bulkDelete').mockRejectedValueOnce(full())
    await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
    await said()
    expect(await db.entries.count()).toBe(1)
  })
})

describe('a failed read', () => {
  it('says the diary could not be read, never that it is empty, and offers a reload', async () => {
    await addEntry({ at: ago(30), layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    vi.spyOn(db.entries, 'count').mockRejectedValue(new DOMException('The database connection is closing.', 'InvalidStateError'))
    const reload = vi.fn()
    render(App, { props: { reload } })
    await go('Diario')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Non riesco a leggere il diario')
    expect(screen.queryByText('Ancora nessuna voce.')).not.toBeInTheDocument()
    await fireEvent.click(within(alert).getByRole('button', { name: 'Ricarica' }))
    expect(reload).toHaveBeenCalled()
  })

  it('Trends says the same instead of "nothing in this period"', async () => {
    await addEntry({ at: ago(30), layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    // Trends reads the range by time; that read fails, every other one works.
    const where = db.entries.where.bind(db.entries)
    const closing = () => Promise.reject(new DOMException('The database connection is closing.', 'InvalidStateError'))
    vi.spyOn(db.entries, 'where').mockImplementation(((key: string) => (key === 'at' ? { aboveOrEqual: () => ({ toArray: closing }) } : where(key))) as never)
    render(App)
    await go('Andamento')
    expect(await screen.findByRole('alert')).toHaveTextContent('Non riesco a leggere il diario')
    expect(screen.queryByText('Nessuna voce in questo periodo.')).not.toBeInTheDocument()
  })
})
