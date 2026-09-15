import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { install, initInstall } from '../lib/install.svelte'
import App from '../App.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
  prefs.mirror = true
  prefs.ongoing = false
  prefs.hintDismissed = false
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
    expect(e.areas).toEqual([{ regions: ['thigh.l', 'thigh.r'], intensity: 7 }])
    expect(e.readings.pain).toBe(7)
    expect(e.ongoing).toBe(false)
    expect(await screen.findByText('Salvato')).toBeInTheDocument()
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
    expect(e.areas[1]).toEqual({ regions: ['shoulder.l', 'shoulder.r'], intensity: 3 })
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

describe('Details sheet', () => {
  it('keeps symptoms, tags and the note out of the form until asked', () => {
    render(App)
    expect(screen.queryByRole('textbox', { name: 'Note' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Freddo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Gonfiore' })).not.toBeInTheDocument()
  })

  it('opens them in a sheet and counts what is set on the button', async () => {
    render(App)
    const btn = screen.getByRole('button', { name: /^Sintomi · rimedi · note/ })
    await fireEvent.click(btn)
    const sheet = await screen.findByRole('dialog', { name: 'Sintomi · rimedi · note' })
    await fireEvent.click(await within(sheet).findByRole('button', { name: 'Riposo' }))
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Gonfiore' }), { target: { value: '4' } })
    await fireEvent.input(within(sheet).getByRole('textbox', { name: 'Note' }), { target: { value: 'dopo la corsa' } })
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(btn).toHaveTextContent('Sintomi · rimedi · note 3')

    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.tags).toEqual(['rest'])
    expect(e.readings.swelling).toBe(4)
    expect(e.note).toBe('dopo la corsa')
    expect(btn).toHaveTextContent(/^Sintomi · rimedi · note$/)
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
    const strip = await screen.findByLabelText('Tag recenti')
    await waitFor(() => expect(within(strip).getAllByRole('button').map((b) => b.textContent)).toEqual(['Compressione', 'Linfodrenaggio', 'Movimento', 'Riposo', 'Calore']))
    await fireEvent.click(within(strip).getByRole('button', { name: 'Calore' }))
    expect(within(strip).getByRole('button', { name: 'Calore' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect((await db.entries.toArray())[0]?.tags).toEqual(['heat']))
    // Once used, a tag moves to the front of the strip and the form is clean again.
    await waitFor(() => expect(within(strip).getAllByRole('button')[0]).toHaveTextContent('Calore'))
    expect(within(strip).getByRole('button', { name: 'Calore' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows a first-run hint pointing at the details sheet until dismissed', async () => {
    render(App)
    expect(screen.getByText(/Altri sintomi, rimedi e note/)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Nascondi' }))
    expect(screen.queryByText(/Altri sintomi, rimedi e note/)).not.toBeInTheDocument()
    expect(prefs.hintDismissed).toBe(true)
    expect(localStorage.getItem('gj.prefs')).toContain('"hintDismissed":true')
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
    await fireEvent.click(screen.getByRole('button', { name: /^Sintomi · rimedi · note/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Sintomi · rimedi · note' })
    await fireEvent.input(await within(sheet).findByRole('slider', { name: 'Gonfiore' }), { target: { value: '3' } })
    await fireEvent.keyDown(window, { key: 'Escape' })
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '0' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    const chip = await screen.findByRole('button', { name: /^3 gonfiore/ })
    expect(chip).toBeInTheDocument()
  })

  it('the episode sheet has a slider per symptom and Aggiorna updates all of them', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: /^Sintomi · rimedi · note/ }))
    const details = await screen.findByRole('dialog', { name: 'Sintomi · rimedi · note' })
    await fireEvent.input(await within(details).findByRole('slider', { name: 'Gonfiore' }), { target: { value: '3' } })
    await fireEvent.keyDown(window, { key: 'Escape' })
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

describe('Install nudge', () => {
  beforeEach(() => {
    prefs.installedAt = null
    install.dismissed = false
  })

  it('shows under the today strip while the app is not installed', () => {
    render(App)
    const banner = screen.getByText('Aggiungi alla schermata Home per tenere i dati al sicuro').closest('.card')!
    const today = screen.getByLabelText('Oggi')
    expect(today.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
