import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { install, initInstall } from '../lib/install.svelte'
import { go, back, presetButton, episodesButton, episodeItems, openEpisode, salva, findToast } from '../test/nav'
import App from '../App.svelte'
import { addEntry } from '../lib/entries'
import { mergedReadings, mergedTags } from '../lib/layers'
import { resetLog, heads, lastUpdate, more, fill, menuOfPresets } from '../test/log'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetLog()
})

describe('Log fast path', () => {
  it('tap region, set intensity, save', async () => {
    render(App)
    // The headline comes from the vocabulary, read after the first frame.
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    const slider = screen.getByRole('slider', { name: 'Dolore' })
    await fireEvent.input(slider, { target: { value: '7' } })
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toEqual([{ regions: ['152', '153'], readings: { pain: 7 }, tags: [] }])
    expect(e.kind).toBe('chronic')
    expect(await screen.findByText('Salvato')).toBeInTheDocument()
    // No today strip: the toast is the receipt, the diary is the review.
    expect(screen.queryByLabelText('Oggi')).not.toBeInTheDocument()
    expect(screen.queryByText('niente ancora')).not.toBeInTheDocument()
  })

  it('supports two layers with different levels, the second starting at the level of the first', async () => {
    render(App)
    // The headline comes from the vocabulary, read after the first frame.
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '8' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Spalla sx' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '3' } })
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toHaveLength(2)
    expect(e.layers[0].readings.pain).toBe(8)
    expect(e.layers[1]).toEqual({ regions: ['130', '131'], readings: { pain: 3 }, tags: [] })
    expect(mergedReadings(e.layers).pain).toBe(8)
  })

  it('undo removes the saved entry', async () => {
    render(App)
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(0))
  })

  it('an ongoing entry shows in its own dropdown, between the menu and the presets, tinted by its level; its sheet ends it (#37)', async () => {
    render(App)
    // The headline comes from the vocabulary, read after the first frame.
    await screen.findByRole('slider', { name: 'Dolore' })
    expect(episodesButton()).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Tutto il corpo' }))
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    await salva()
    await waitFor(() => expect(episodesButton()).toHaveAccessibleName('1 in corso'))
    const button = episodesButton()!
    expect(screen.getByRole('button', { name: 'Menu' }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button.compareDocumentPosition(presetButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button.style.background).toBe(fill(5))
    const [item] = await episodeItems()
    expect(item).toHaveTextContent(/^5\s*tutto il corpo · da /)
    // No Termina on the log screen: ending is the sheet's; no episode among the presets either.
    expect(screen.queryByRole('button', { name: 'Termina adesso' })).not.toBeInTheDocument()
    expect(within(await menuOfPresets()).queryByText(/tutto il corpo/)).not.toBeInTheDocument()
    const sheet = await openEpisode()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Termina adesso' }))
    await waitFor(async () => {
      const [e] = await db.entries.toArray()
      expect(e.endedAt).not.toBeNull()
    })
    await waitFor(() => expect(episodesButton()).toBeNull())
  })

  it('counts every episode going on and lists each, the button tinted by the highest level', async () => {
    await addEntry({ kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 3 } }] })
    await addEntry({ kind: 'episode', layers: [{ regions: ['130'], readings: { pain: 8 } }] })
    render(App)
    await waitFor(() => expect(episodesButton()).toHaveAccessibleName('2 in corso'))
    // Tinted by the highest level; the numbers are in the menu, not side by side with the count.
    expect(episodesButton()!.style.background).toBe(fill(8))
    expect(episodesButton()).toHaveTextContent(/^2 in corso$/)
    expect((await episodeItems()).map((i) => i.textContent?.trim()[0]).sort()).toEqual(['3', '8'])
  })
})

describe('The drawer', () => {
  it('peeks with the pain slider and Salva; the handle brings the other symptoms, the tags and the note, the full tag list behind Tutti i tag', async () => {
    render(App)
    // The headline comes from the vocabulary, read after the first frame.
    await screen.findByRole('slider', { name: 'Dolore' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Dolore' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salva' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Gonfiore' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Note' })).not.toBeInTheDocument()
    const handle = screen.getByRole('button', { name: /^Altro/ })
    expect(handle).toHaveAttribute('aria-expanded', 'false')
    await fireEvent.click(handle)
    expect(handle).toHaveAttribute('aria-expanded', 'true')
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
    // The handle folds it back; so does a new draft.
    await fireEvent.click(handle)
    expect(screen.queryByRole('slider', { name: 'Gonfiore' })).not.toBeInTheDocument()
    await fireEvent.click(handle)
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect(screen.getByRole('button', { name: /^Altro/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('slider', { name: 'Gonfiore' })).not.toBeInTheDocument()
  })

  it('draws every symptom slider the same size, pain included (#37)', async () => {
    render(App)
    await more()
    await screen.findByRole('slider', { name: 'Gonfiore' })
    const styles = screen.getAllByRole('slider').map((s) => s.closest('.slider')!.className)
    expect(styles.length).toBeGreaterThan(2)
    expect(new Set(styles).size).toBe(1)
  })

  it('saves what is set in the drawer and leaves the form clean', async () => {
    render(App)
    await more()
    await fireEvent.click(await screen.findByRole('button', { name: 'Riposo' }))
    // The symptom sliders come from a live query: on a slow runner they land after the tag strip.
    await fireEvent.input(await screen.findByRole('slider', { name: 'Gonfiore' }), { target: { value: '4' } })
    await fireEvent.input(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'dopo la corsa' } })
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toEqual([{ regions: [], readings: { pain: 5, swelling: 4 }, tags: ['rest'] }])
    expect(e.note).toBe('dopo la corsa')
    await more()
    expect(screen.getByRole('slider', { name: 'Gonfiore' })).toHaveValue('0')
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('')
  })

  it('the grouped view stands in for the strip and shares its state', async () => {
    render(App)
    await more()
    let strip = await screen.findByLabelText('Tag frequenti')
    await waitFor(() => expect(within(strip).getAllByRole('button')).toHaveLength(17))
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
    await salva()
    await waitFor(async () => expect(mergedTags((await db.entries.toArray())[0].layers)).toEqual([]))
  })

  it('shows the toast just above the drawer, over the stage, not over the slider (#23)', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    // jsdom measures the drawer at 0px: the lift is there, its value is the drawer's height.
    expect((await findToast()).style.getPropertyValue('--lift')).toBe('0px')
    await go('Diario')
    await back()
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Azzera' }))
    expect((await findToast()).style.getPropertyValue('--lift')).toBe('0px')
  })

  it('shows the toast at its usual height away from the log', async () => {
    render(App)
    await go('Diario')
    const { showToast } = await import('../lib/toast.svelte')
    showToast('ciao')
    expect((await findToast()).style.getPropertyValue('--lift')).toBe('')
  })

  it('Azzera empties the form and the toast undoes it', async () => {
    render(App)
    // The headline comes from the vocabulary, read after the first frame.
    await screen.findByRole('slider', { name: 'Dolore' })
    const clear = screen.getByRole('button', { name: 'Azzera' })
    expect(clear).toBeDisabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '8' } })
    await more()
    await fireEvent.input(await screen.findByRole('slider', { name: 'Gonfiore' }), { target: { value: '3' } })
    await fireEvent.input(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'dopo la corsa' } })
    expect(clear).toBeEnabled()
    await fireEvent.click(clear)
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Nessuna zona: tocca la figura')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Dolore' })).toHaveAttribute('aria-valuetext', 'non indicato')
    await more()
    expect(screen.getByRole('slider', { name: 'Gonfiore' })).toHaveAttribute('aria-valuetext', 'non indicato')
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('')
    expect(clear).toBeDisabled()
    expect(await db.entries.count()).toBe(0)
    expect(await screen.findByText('Modulo azzerato')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('slider', { name: 'Dolore' })).toHaveValue('8')
    await more()
    expect(screen.getByRole('slider', { name: 'Gonfiore' })).toHaveValue('3')
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('dopo la corsa')
    expect(clear).toBeEnabled()
  })

  it('the episode sheet offers to edit areas and note', async () => {
    render(App)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    await salva()
    const sheet = await openEpisode()
    expect(within(sheet).getByRole('button', { name: 'Modifica' })).toBeInTheDocument()
  })
})

describe('Tag discoverability', () => {
  it('offers the first remedies in a strip under the slider and toggles them on the draft', async () => {
    render(App)
    await more()
    let strip = await screen.findByLabelText('Tag frequenti')
    const names = () => within(strip).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    // Every enabled tag, vocabulary order until something has been used.
    await waitFor(() => expect(names().slice(0, 7)).toEqual(['Tutti i tag', 'Compressione', 'Linfodrenaggio', 'Movimento', 'Riposo', 'Impacco caldo', 'Impacco freddo']))
    expect(names()).toHaveLength(17)
    expect(names().at(-1)).toBe('Viaggio')
    await fireEvent.click(within(strip).getByRole('button', { name: 'Impacco caldo' }))
    expect(within(strip).getByRole('button', { name: 'Impacco caldo' })).toHaveAttribute('aria-pressed', 'true')
    await salva()
    await waitFor(async () => expect(mergedTags((await db.entries.toArray())[0].layers)).toEqual(['heat']))
    // Once used, a tag is the most frequent: first after the toggle, and the form is clean again (folded: pull it up).
    await more()
    strip = await screen.findByLabelText('Tag frequenti')
    await waitFor(() => expect(names()[1]).toBe('Impacco caldo'))
    expect(within(strip).getByRole('button', { name: 'Impacco caldo' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('an episode row in the menu says what, where, since when, then its tags: a tag never sits where the place goes', async () => {
    await addEntry({ at: new Date(Date.now() - 30 * 60_000).toISOString(), kind: 'episode', layers: [{ regions: [], readings: { pain: 4 }, tags: ['badsleep'] }] })
    await addEntry({ at: new Date(Date.now() - 20 * 60_000).toISOString(), kind: 'episode', layers: [{ regions: ['154'], readings: { pain: 6 }, tags: ['badsleep'] }] })
    render(App)
    const rows = (await episodeItems()).map((i) => i.textContent!.replace(/\s+/g, ' ').trim())
    expect(rows).toContainEqual(expect.stringMatching(/^4 da 3\dm · Dormito male$/))
    expect(rows).toContainEqual(expect.stringMatching(/^6 ginocchio sx · da 2\dm · Dormito male$/))
  })

  it('records remedies from the episode sheet on Aggiorna and Termina', async () => {
    render(App)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    await salva()
    let sheet = await openEpisode()
    await fireEvent.click(await within(sheet).findByRole('button', { name: 'Riposo' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => expect(mergedTags((await lastUpdate())!.layers)).toEqual(['rest']))
    await waitFor(async () => expect((await episodeItems())[0]).toHaveTextContent('Riposo'))
    // Nothing is carried: the sheet opens with every chip unpressed, and a chip is what is done now.
    sheet = await openEpisode()
    expect(await within(sheet).findByRole('button', { name: 'Riposo' })).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Impacco caldo' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Termina adesso' }))
    // A remedy chosen at the end is one more reading, then the head gets its end.
    await waitFor(async () => {
      const [h] = await heads()
      expect(h.endedAt).not.toBeNull()
      expect(mergedTags((await lastUpdate())!.layers)).toEqual(['heat'])
    })
  })
})

describe('Install nudge', () => {
  beforeEach(() => {
    prefs.installedAt = null
    install.dismissed = false
  })

  it('shows above the body map while the app is not installed', () => {
    render(App)
    const banner = screen.getByText('Aggiungi alla schermata Home per tenere i dati al sicuro').closest('.msg')!
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
    // A visible way out, besides the backdrop and back.
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Chiudi' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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
