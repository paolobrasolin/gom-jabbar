import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { install, initInstall } from '../lib/install.svelte'
import App from '../App.svelte'
import { LEG_IDS } from '../lib/regions'
import { addPreset } from '../lib/presets'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
  prefs.mirror = true
  prefs.ongoing = false
})

describe('Log fast path', () => {
  it('tap region, set intensity, save', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    const slider = screen.getByRole('slider', { name: 'Dolore' })
    await fireEvent.input(slider, { target: { value: '7' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.areas).toEqual([{ regions: ['152', '153'], intensity: 7 }])
    expect(e.readings.pain).toBe(7)
    expect(e.ongoing).toBe(false)
    expect(await screen.findByText('Salvato')).toBeInTheDocument()
    // No today strip: the toast is the receipt, the diary is the review.
    expect(screen.queryByLabelText('Oggi')).not.toBeInTheDocument()
    expect(screen.queryByText('niente ancora')).not.toBeInTheDocument()
  })

  it('supports two areas with different levels', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '8' } })
    await fireEvent.click(screen.getByRole('button', { name: '+ Altra zona' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Spalla sx' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '3' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.areas).toHaveLength(2)
    expect(e.areas[0].intensity).toBe(8)
    expect(e.areas[1]).toEqual({ regions: ['130', '131'], intensity: 3 })
    expect(e.readings.pain).toBe(8)
  })

  it('undo removes the saved entry', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(0))
  })

  it('ongoing entry shows as active episode and can be ended', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Tutto il corpo' }))
    await fireEvent.click(screen.getByRole('button', { name: 'In corso' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    const endBtn = await screen.findByRole('button', { name: 'Termina adesso' })
    expect(screen.getByText('tutto il corpo')).toBeInTheDocument()
    await fireEvent.click(endBtn)
    await waitFor(async () => {
      const [e] = await db.entries.toArray()
      expect(e.ongoing).toBe(false)
      expect(e.endedAt).not.toBeNull()
    })
  })
})

describe('Details inline', () => {
  it('shows the other symptoms and the note on the page, the full tag list behind Tutti i tag', async () => {
    render(App)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('slider', { name: 'Gonfiore' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Note' })).toBeInTheDocument()
    expect(screen.queryByText('Contesto')).not.toBeInTheDocument()
    const all = () => screen.getByRole('button', { name: 'Tutti i tag' })
    expect(all()).toHaveAttribute('aria-expanded', 'false')
    await fireEvent.click(all())
    expect(all()).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('Rimedi')).toBeInTheDocument()
    expect(screen.getByText('Contesto')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stress' })).toBeInTheDocument()
    await fireEvent.click(all())
    expect(all()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Contesto')).not.toBeInTheDocument()
  })

  it('saves what is set inline and leaves the form clean', async () => {
    render(App)
    await fireEvent.click(await screen.findByRole('button', { name: 'Riposo' }))
    // The symptom sliders come from a live query: on a slow runner they land after the tag strip.
    await fireEvent.input(await screen.findByRole('slider', { name: 'Gonfiore' }), { target: { value: '4' } })
    await fireEvent.input(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'dopo la corsa' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.tags).toEqual(['rest'])
    expect(e.readings.swelling).toBe(4)
    expect(e.note).toBe('dopo la corsa')
    expect(screen.getByRole('slider', { name: 'Gonfiore' })).toHaveValue('0')
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('')
  })

  it('the grouped view stands in for the strip and shares its state', async () => {
    render(App)
    let strip = await screen.findByLabelText('Tag frequenti')
    await waitFor(() => expect(within(strip).getAllByRole('button')).toHaveLength(16))
    await fireEvent.click(screen.getByRole('button', { name: 'Tutti i tag' }))
    // Expanded: the strip is gone, the grouped list stands in its place, the same toggle folds it back.
    expect(screen.queryByLabelText('Tag frequenti')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Compressione' })).toHaveLength(1)
    await fireEvent.click(screen.getByRole('button', { name: 'Stress' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Tutti i tag' }))
    strip = await screen.findByLabelText('Tag frequenti')
    expect(within(strip).getAllByRole('button')[0]).toHaveAccessibleName('Tutti i tag')
    const chip = within(strip).getByRole('button', { name: 'Stress' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect((await db.entries.toArray())[0]?.tags).toEqual([]))
  })

  it('Azzera empties the form and the toast undoes it', async () => {
    render(App)
    const clear = screen.getByRole('button', { name: 'Azzera' })
    expect(clear).toBeDisabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '8' } })
    await fireEvent.input(await screen.findByRole('slider', { name: 'Gonfiore' }), { target: { value: '3' } })
    await fireEvent.input(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'dopo la corsa' } })
    expect(clear).toBeEnabled()
    await fireEvent.click(clear)
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Nessuna zona: tocca le figure')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Dolore' })).toHaveValue('5')
    expect(screen.getByRole('slider', { name: 'Gonfiore' })).toHaveValue('0')
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('')
    expect(clear).toBeDisabled()
    expect(await db.entries.count()).toBe(0)
    expect(await screen.findByText('Modulo azzerato')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('slider', { name: 'Dolore' })).toHaveValue('8')
    expect(screen.getByRole('slider', { name: 'Gonfiore' })).toHaveValue('3')
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('dopo la corsa')
    expect(clear).toBeEnabled()
  })

  it('the episode sheet offers to edit areas and note', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'In corso' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Episodio in corso' }))
    const sheet = await screen.findByRole('dialog', { name: 'Episodio in corso' })
    expect(within(sheet).getByRole('button', { name: 'Modifica zone e note' })).toBeInTheDocument()
  })
})

describe('Tag discoverability', () => {
  it('offers the first remedies in a strip under the slider and toggles them on the draft', async () => {
    render(App)
    const strip = await screen.findByLabelText('Tag frequenti')
    const names = () => within(strip).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    // Every enabled tag, vocabulary order until something has been used.
    await waitFor(() => expect(names().slice(0, 7)).toEqual(['Tutti i tag', 'Compressione', 'Linfodrenaggio', 'Movimento', 'Riposo', 'Calore', 'Freddo']))
    expect(names()).toHaveLength(16)
    expect(names().at(-1)).toBe('Viaggio')
    await fireEvent.click(within(strip).getByRole('button', { name: 'Calore' }))
    expect(within(strip).getByRole('button', { name: 'Calore' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect((await db.entries.toArray())[0]?.tags).toEqual(['heat']))
    // Once used, a tag is the most frequent: first after the toggle, and the form is clean again.
    await waitFor(() => expect(names()[1]).toBe('Calore'))
    expect(within(strip).getByRole('button', { name: 'Calore' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('records remedies from the episode sheet on Aggiorna and Termina', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'In corso' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Episodio in corso' }))
    let sheet = await screen.findByRole('dialog', { name: 'Episodio in corso' })
    await fireEvent.click(await within(sheet).findByRole('button', { name: 'Riposo' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => expect((await db.entries.toArray())[0].tags).toEqual(['rest']))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Episodio in corso' })).toHaveTextContent('Riposo'))
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio in corso' }))
    sheet = await screen.findByRole('dialog', { name: 'Episodio in corso' })
    expect(await within(sheet).findByRole('button', { name: 'Riposo' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Calore' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Termina adesso' }))
    await waitFor(async () => {
      const [e] = await db.entries.toArray()
      expect(e.ongoing).toBe(false)
      expect(e.tags).toEqual(['rest', 'heat'])
    })
  })
})

describe('Headline reading', () => {
  it('shows swelling as the headline when pain is 0', async () => {
    render(App)
    await fireEvent.input(await screen.findByRole('slider', { name: 'Gonfiore' }), { target: { value: '3' } })
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '0' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    await fireEvent.click(screen.getByRole('button', { name: 'Diario' }))
    const row = (await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0]
    expect(row).toHaveAccessibleName(/3\s*gonfiore/)
  })

  it('the episode sheet has a slider per symptom and Aggiorna updates all of them', async () => {
    render(App)
    await fireEvent.input(await screen.findByRole('slider', { name: 'Gonfiore' }), { target: { value: '3' } })
    await fireEvent.click(screen.getByRole('button', { name: 'In corso' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Episodio in corso' }))
    const sheet = await screen.findByRole('dialog', { name: 'Episodio in corso' })
    expect(within(sheet).getByRole('slider', { name: 'Dolore' })).toHaveValue('5')
    expect(within(sheet).queryByRole('slider', { name: 'Stanchezza' })).not.toBeInTheDocument()
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Gonfiore' }), { target: { value: '6' } })
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '2' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => {
      const [e] = await db.entries.toArray()
      expect(e.readings).toEqual({ pain: 2, swelling: 6 })
      expect(e.history?.map((h) => h.readings)).toEqual([{ pain: 5, swelling: 3 }, { pain: 2, swelling: 6 }])
    })
    // The card now leads with swelling, the highest reading.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Episodio in corso' })).toHaveTextContent(/^6\s*gonfiore/))
  })
})

describe('Presets', () => {
  it('creates a preset from a saved entry, logs from its chip and shows the last value', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    // The entry just saved is the first diary row; its edit sheet is where a preset is made.
    await fireEvent.click(screen.getByRole('button', { name: 'Diario' }))
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
    const edit = await screen.findByRole('dialog', { name: 'Modifica' })
    expect(within(edit).queryByRole('textbox', { name: 'Nome del preset' })).not.toBeInTheDocument()
    await fireEvent.click(within(edit).getByRole('button', { name: 'Crea preset da questa voce' }))
    const name = within(edit).getByRole('textbox', { name: 'Nome del preset' })
    expect(name).toHaveFocus()
    expect(within(edit).getByRole('button', { name: 'Crea preset' })).toBeDisabled()
    await fireEvent.input(name, { target: { value: 'Le gambe' } })
    await fireEvent.click(within(edit).getByRole('button', { name: 'Crea preset' }))
    expect(await screen.findByText('Preset creato')).toBeInTheDocument()
    expect(within(edit).queryByRole('textbox', { name: 'Nome del preset' })).not.toBeInTheDocument()
    await fireEvent.keyDown(window, { key: 'Escape' })
    await fireEvent.click(screen.getByRole('button', { name: 'Registra' }))

    const strip = await screen.findByLabelText('Preset')
    const chip = await within(strip).findByRole('button', { name: /Le gambe/ })
    expect(chip).toHaveTextContent('mai')
    expect(await db.presets.count()).toBe(1)
    const [p] = await db.presets.toArray()
    expect(p.areas).toEqual([{ regions: [...LEG_IDS].sort(), intensity: 5 }])
    expect(p.symptomIds).toEqual(['pain'])
    await fireEvent.click(chip)
    const ps = await screen.findByRole('dialog', { name: 'Le gambe' })
    await fireEvent.input(within(ps).getByRole('slider', { name: 'Dolore' }), { target: { value: '6' } })
    await fireEvent.click(within(ps).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => {
      expect(await db.entries.count()).toBe(2)
      const e = (await db.entries.toArray()).find((x) => x.preset)!
      expect(e.preset).toBe(p.id)
      expect(e.readings.pain).toBe(6)
      expect(e.areas).toEqual([{ regions: [...LEG_IDS].sort(), intensity: 6 }])
    })
    await waitFor(() => expect(within(strip).getByRole('button', { name: /Le gambe/ })).toHaveTextContent(/^6\s*Le gambe · 0m$/))
  })

  it('a preset made from an entry with other symptoms and tags tracks them', async () => {
    const { addEntry } = await import('../lib/entries')
    await addEntry({ areas: [{ regions: ['224'], intensity: 4 }], readings: { pain: 4, swelling: 2 }, tags: ['heat'], note: 'x' })
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Diario' }))
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
    const edit = await screen.findByRole('dialog', { name: 'Modifica' })
    await fireEvent.click(within(edit).getByRole('button', { name: 'Crea preset da questa voce' }))
    await fireEvent.input(within(edit).getByRole('textbox', { name: 'Nome del preset' }), { target: { value: 'Schiena' } })
    await fireEvent.keyDown(within(edit).getByRole('textbox', { name: 'Nome del preset' }), { key: 'Enter' })
    await waitFor(async () => expect(await db.presets.count()).toBe(1))
    const [p] = await db.presets.toArray()
    expect(p).toMatchObject({ name: 'Schiena', symptomIds: ['pain', 'swelling'], tags: ['heat'], ongoing: false, areas: [{ regions: ['224'], intensity: 4 }] })
  })

  it('starts the preset sheet from the last logged levels', async () => {
    const p = await addPreset({ name: 'Schiena', areas: [{ regions: ['224'], intensity: 5 }], symptomIds: ['pain', 'swelling'], tags: [], ongoing: false })
    const { logPreset } = await import('../lib/presets')
    await logPreset(p, { pain: 3, swelling: 7 })
    render(App)
    const strip = await screen.findByLabelText('Preset')
    await fireEvent.click(await within(strip).findByRole('button', { name: /Schiena/ }))
    const ps = await screen.findByRole('dialog', { name: 'Schiena' })
    await waitFor(() => expect(within(ps).getByRole('slider', { name: 'Dolore' })).toHaveValue('3'))
    expect(within(ps).getByRole('slider', { name: 'Gonfiore' })).toHaveValue('7')
  })
})

describe('Install nudge', () => {
  beforeEach(() => {
    prefs.installedAt = null
    install.dismissed = false
  })

  it('shows above the body map while the app is not installed', () => {
    render(App)
    const banner = screen.getByText('Aggiungi alla schermata Home per tenere i dati al sicuro').closest('.card')!
    const map = screen.getAllByRole('group')[0]
    expect(banner.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('dismiss hides it for this session only, without touching prefs', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Non ora' }))
    expect(screen.queryByText(/Aggiungi alla schermata Home per/)).not.toBeInTheDocument()
    expect(install.dismissed).toBe(true)
    expect(localStorage.getItem('gj.prefs') ?? '').not.toContain('dismissed')
  })

  it('is hidden once the app has run standalone', () => {
    prefs.installedAt = '2026-09-01T00:00:00.000Z'
    render(App)
    expect(screen.queryByText(/Aggiungi alla schermata Home per/)).not.toBeInTheDocument()
  })

  it('is hidden while running standalone', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(display-mode: standalone)', addEventListener() {}, removeEventListener() {} }))
    render(App)
    expect(screen.queryByText(/Aggiungi alla schermata Home per/)).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('opens the how-to sheet when the browser offers no install prompt', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }))
    const sheet = await screen.findByRole('dialog', { name: 'Aggiungi alla schermata Home' })
    expect(sheet).toHaveTextContent(/menu del browser/)
  })

  it('explains the Share button on iOS', async () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }))
    const sheet = await screen.findByRole('dialog', { name: 'Aggiungi alla schermata Home' })
    expect(sheet).toHaveTextContent(/Condividi/)
    vi.unstubAllGlobals()
  })

  it('replays the captured browser prompt instead of the sheet', async () => {
    initInstall()
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' }> }
    e.prompt = vi.fn(async () => {})
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(e)
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }))
    await waitFor(() => expect(e.prompt).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
