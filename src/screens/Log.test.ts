import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { install, initInstall } from '../lib/install.svelte'
import App from '../App.svelte'
import { LEG_IDS, REGION_BY_ID, shapeOf, shapeCenter } from '../lib/regions'
import { addPreset } from '../lib/presets'
import { addEntry } from '../lib/entries'
import { regionLabel } from '../lib/regionLabel'
import { t } from '../i18n/index.svelte'
import { mergedReadings, mergedTags, type Stroke } from '../lib/layers'

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
    expect(e.layers).toEqual([{ regions: ['152', '153'], readings: { pain: 7 }, tags: [] }])
    expect(e.ongoing).toBe(false)
    expect(await screen.findByText('Salvato')).toBeInTheDocument()
    // No today strip: the toast is the receipt, the diary is the review.
    expect(screen.queryByLabelText('Oggi')).not.toBeInTheDocument()
    expect(screen.queryByText('niente ancora')).not.toBeInTheDocument()
  })

  it('supports two layers with different levels, the second starting at the level of the first', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '8' } })
    await fireEvent.click(screen.getByRole('button', { name: '+ Altra zona' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Spalla sx' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '3' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toHaveLength(2)
    expect(e.layers[0].readings.pain).toBe(8)
    expect(e.layers[1]).toEqual({ regions: ['130', '131'], readings: { pain: 3 }, tags: [] })
    expect(mergedReadings(e.layers).pain).toBe(8)
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
    expect(e.layers).toEqual([{ regions: [], readings: { pain: 5, swelling: 4 }, tags: ['rest'] }])
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
    await waitFor(async () => expect(mergedTags((await db.entries.toArray())[0].layers)).toEqual([]))
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
    await waitFor(async () => expect(mergedTags((await db.entries.toArray())[0].layers)).toEqual(['heat']))
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
    await waitFor(async () => expect(mergedTags((await db.entries.toArray())[0].layers)).toEqual(['rest']))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Episodio in corso' })).toHaveTextContent('Riposo'))
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio in corso' }))
    sheet = await screen.findByRole('dialog', { name: 'Episodio in corso' })
    expect(await within(sheet).findByRole('button', { name: 'Riposo' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Calore' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Termina adesso' }))
    await waitFor(async () => {
      const [e] = await db.entries.toArray()
      expect(e.ongoing).toBe(false)
      expect(mergedTags(e.layers)).toEqual(['rest', 'heat'])
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
      expect(e.layers[0].readings).toEqual({ pain: 2, swelling: 6 })
      expect(e.history?.map((h) => h.layers)).toEqual([[{ pain: 5, swelling: 3 }], [{ pain: 2, swelling: 6 }]])
    })
    // The card now leads with swelling, the highest reading.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Episodio in corso' })).toHaveTextContent(/^6\s*gonfiore/))
  })
})

describe('Mind and mind symptoms', () => {
  it('opens with both kinds of sliders; the mind shows the mind ones only and saves a mind layer with the mental readings, no pain', async () => {
    render(App)
    expect(await screen.findByRole('slider', { name: 'Nebbia mentale' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Dolore' })).toBeInTheDocument()
    const mind = screen.getByRole('button', { name: 'Mente' })
    expect(mind).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(mind)
    expect(screen.getByRole('button', { name: 'Mente' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Gonfiore' })).not.toBeInTheDocument()
    await fireEvent.input(screen.getByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '6' } })
    expect(screen.getByRole('button', { name: /6\s*nebbia mentale · mente/ })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toEqual([{ regions: ['mind'], readings: { fog: 6 }, tags: [] }])
    // The form is back to both kinds, the pain level untouched by the detour.
    expect(await screen.findByRole('slider', { name: 'Dolore' })).toHaveValue('5')
    await fireEvent.click(screen.getByRole('button', { name: 'Diario' }))
    const row = (await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0]
    expect(row).toHaveAccessibleName(/6\s*nebbia mentale · mente/)
  })

  it('a body region alone shows the body sliders only; the mind joins its layer, one pill for both, pain still editing the body', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await screen.findByRole('slider', { name: 'Gonfiore' })
    expect(screen.queryByRole('slider', { name: 'Nebbia mentale' })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Mente' }))
    // Both sets now, and still one chip: the mind sits with the legs at their level.
    await fireEvent.input(await screen.findByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '4' } })
    expect(screen.getByRole('slider', { name: 'Gonfiore' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /mente/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: /5\s*gambe, mente/ })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '7' } })
    expect(screen.getByRole('button', { name: /7\s*gambe, mente/ })).toHaveAttribute('aria-pressed', 'true')
    // A knee joins the same area; the mind slider stays.
    await fireEvent.click(screen.getByRole('button', { name: 'Ginocchio sx' }))
    expect(screen.getByRole('button', { name: /7\s*gambe, mente/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('slider', { name: 'Nebbia mentale' })).toHaveValue('4')
    await fireEvent.click(screen.getByRole('button', { name: 'Tutto il corpo' }))
    expect(screen.getByRole('button', { name: 'Mente' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /7\s*tutto il corpo, mente/ })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toEqual([{ regions: ['*', 'mind'], readings: { pain: 7, fog: 4 }, tags: [] }])
    await fireEvent.click(screen.getByRole('button', { name: 'Diario' }))
    const row = (await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0]
    expect(row).toHaveAccessibleName(/7\s*tutto il corpo, mente/)
  })

  it('the mind first, then a leg: the leg joins the mind, the chip reads the layer headline and the pain slider comes back', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Mente' }))
    await fireEvent.input(await screen.findByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '6' } })
    expect(screen.getByRole('button', { name: /6\s*nebbia mentale · mente/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    // Fog 6 beats the pain at 5: the chip is the layer's headline, named like the diary pill.
    expect(screen.getByRole('button', { name: /6\s*nebbia mentale · gambe, mente/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button', { name: /mente/ })).toHaveLength(1)
    expect(await screen.findByRole('slider', { name: 'Dolore' })).toHaveValue('5')
    expect(screen.getByRole('slider', { name: 'Nebbia mentale' })).toHaveValue('6')
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '8' } })
    expect(screen.getByRole('button', { name: /8\s*gambe, mente/ })).toBeInTheDocument()
    // The mind leaves: the legs stay at their level, the mental sliders fold away and their reading does not reach the entry.
    await fireEvent.click(screen.getByRole('button', { name: 'Mente' }))
    expect(screen.getByRole('button', { name: /8\s*gambe$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('slider', { name: 'Nebbia mentale' })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toEqual([{ regions: ['152', '153'], readings: { pain: 8 }, tags: [] }])
  })

  it('a second layer over the same legs keeps its own readings and tags, and the map fades the other layer', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '7' } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Compressione' }))
    await fireEvent.click(screen.getByRole('button', { name: '+ Altra zona' }))
    // The new layer: nothing selected yet, its own sliders and tags.
    expect(screen.getByRole('button', { name: 'Compressione' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('.region[data-region="152"]')).toHaveClass('ghost')
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    expect(document.querySelector('.region[data-region="152"]')).not.toHaveClass('ghost')
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '0' } })
    await fireEvent.input(screen.getByRole('slider', { name: 'Gonfiore' }), { target: { value: '6' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Calore' }))
    expect(screen.getByRole('button', { name: /6\s*gonfiore · gambe · Calore/ })).toHaveAttribute('aria-pressed', 'true')
    // Back on the first layer: the legs are still all there, with their tag.
    await fireEvent.click(screen.getByRole('button', { name: /7\s*fianchi, gambe · Compressione/ }))
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Compressione' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('slider', { name: /^Dolore/ })).toHaveValue('7')
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toEqual([
      { regions: [...LEG_IDS].sort(), readings: { pain: 7 }, tags: ['compression'] },
      { regions: ['152', '153'], readings: { pain: 0, swelling: 6 }, tags: ['heat'] },
    ])
    await fireEvent.click(screen.getByRole('button', { name: 'Diario' }))
    const row = (await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0]
    expect(row).toHaveAccessibleName(/7\s*fianchi, gambe 7 · gambe 6 · Compressione · Calore/)
  })

  it('a mind-only episode is updated from its sheet without a pain slider', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Mente' }))
    await fireEvent.input(await screen.findByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '6' } })
    await fireEvent.click(screen.getByRole('button', { name: 'In corso' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    const card = await screen.findByRole('button', { name: 'Episodio in corso' })
    expect(card).toHaveTextContent(/^6\s*nebbia mentale · mente/)
    await fireEvent.click(card)
    const sheet = await screen.findByRole('dialog', { name: 'Episodio in corso' })
    expect(within(sheet).queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '2' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => {
      const [e] = await db.entries.toArray()
      expect(e.layers).toEqual([{ regions: ['mind'], readings: { fog: 2 }, tags: [] }])
    })
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
    expect(p.layers).toEqual([{ regions: [...LEG_IDS].sort(), readings: { pain: 5 }, tags: [] }])
    expect(p.symptomIds).toEqual(['pain'])
    await fireEvent.click(chip)
    const ps = await screen.findByRole('dialog', { name: 'Le gambe' })
    await fireEvent.input(within(ps).getByRole('slider', { name: 'Dolore' }), { target: { value: '6' } })
    await fireEvent.click(within(ps).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => {
      expect(await db.entries.count()).toBe(2)
      const e = (await db.entries.toArray()).find((x) => x.preset)!
      expect(e.preset).toBe(p.id)
      expect(e.layers).toEqual([{ regions: [...LEG_IDS].sort(), readings: { pain: 6 }, tags: [] }])
    })
    await waitFor(() => expect(within(strip).getByRole('button', { name: /Le gambe/ })).toHaveTextContent(/^6\s*Le gambe · 0m$/))
  })

  it('a preset made from an entry with other symptoms and tags tracks them', async () => {
    const { addEntry } = await import('../lib/entries')
    await addEntry({ layers: [{ regions: ['224'], readings: { pain: 4, swelling: 2 }, tags: ['heat'] }], note: 'x' })
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Diario' }))
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
    const edit = await screen.findByRole('dialog', { name: 'Modifica' })
    await fireEvent.click(within(edit).getByRole('button', { name: 'Crea preset da questa voce' }))
    await fireEvent.input(within(edit).getByRole('textbox', { name: 'Nome del preset' }), { target: { value: 'Schiena' } })
    await fireEvent.keyDown(within(edit).getByRole('textbox', { name: 'Nome del preset' }), { key: 'Enter' })
    await waitFor(async () => expect(await db.presets.count()).toBe(1))
    const [p] = await db.presets.toArray()
    expect(p).toMatchObject({ name: 'Schiena', symptomIds: ['pain', 'swelling'], ongoing: false, layers: [{ regions: ['224'], readings: { pain: 4, swelling: 2 }, tags: ['heat'] }] })
  })

  it('starts the preset sheet from the last logged levels', async () => {
    const p = await addPreset({ name: 'Schiena', layers: [{ regions: ['224'], readings: { pain: 5 }, tags: [] }], symptomIds: ['pain', 'swelling'], ongoing: false })
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

describe('Drawing', () => {
  /** Client coordinates of a figure point on the zoomed svg (jsdom rects sit at 0,0). */
  function at(svg: Element, x: number, y: number) {
    const k = Number(svg.getAttribute('data-k'))
    return { clientX: Number(svg.getAttribute('data-tx')) + k * x, clientY: Number(svg.getAttribute('data-ty')) + k * y }
  }
  const centre = (id: string) => shapeCenter(shapeOf(prefs.figure, REGION_BY_ID[id]))
  const finger = (id: number, xy: { clientX: number; clientY: number }) => ({ ...xy, pointerId: id, button: 0, buttons: 1, isPrimary: id === 1 })
  async function paint(svg: Element, from: [number, number], to: [number, number]) {
    await fireEvent.pointerDown(svg, finger(1, at(svg, ...from)))
    const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.3]
    await fireEvent.pointerMove(svg, finger(1, at(svg, ...mid)))
    await fireEvent.pointerMove(svg, finger(1, at(svg, ...to)))
    await fireEvent.pointerUp(svg, finger(1, at(svg, ...to)))
  }

  it('Disegna zooms one figure; a finger paints a stroke that pulls in the regions it crosses; a tap is a dot', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('img', { name: 'Davanti' })
    expect(screen.queryByRole('group', { name: 'Davanti' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annulla tratto' })).toBeDisabled()

    await paint(front, centre('152'), centre('160'))
    // One gesture, three segments: three pieces, each clipped to its own segment.
    expect(document.querySelectorAll('.stroke')).toHaveLength(3)
    const clip = document.querySelector('.stroke')!.parentElement!.getAttribute('clip-path')!
    expect(clip).toMatch(/^url\(#.*-152\)$/)
    const clipPath = document.getElementById(clip.slice(5, -1))!
    expect(clipPath.tagName).toBe('clipPath')
    expect(clipPath.querySelector('path')!.getAttribute('d')).toBe(document.querySelector('.region[data-region="152"]')!.getAttribute('d'))
    expect(screen.getByText('gamba sx')).toBeInTheDocument()
    // Mirror is on, but a drawing is one-sided.
    expect(screen.queryByText('gambe')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Dietro' }))
    const back = screen.getByRole('img', { name: 'Dietro' })
    const [cx, cy] = centre('261')
    await fireEvent.pointerDown(back, finger(1, at(back, cx, cy)))
    await fireEvent.pointerUp(back, finger(1, at(back, cx, cy)))
    expect(document.querySelectorAll('.stroke')).toHaveLength(1)
    expect(document.querySelector('.stroke')!.getAttribute('d')).toMatch(/ l 0.01 0$/)
    expect(screen.getByText('gambe')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(document.querySelectorAll('.stroke')).toHaveLength(0)
    // The regions the dot pulled in stay.
    expect(screen.getByText('gambe')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    expect(screen.getByRole('group', { name: 'Davanti' })).toBeInTheDocument()
    expect(document.querySelectorAll('.stroke')).toHaveLength(3)

    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    const r1 = (n: number) => Math.round(n * 10) / 10
    expect(e.layers).toHaveLength(1)
    expect(e.layers[0].regions).toEqual(['152', '154', '160', '261'])
    const pieces = e.layers[0].strokes!
    expect(pieces.map((p) => p.region)).toEqual(['152', '154', '160'])
    expect(pieces[0]).toMatchObject({ fig: 'female', view: 'front', w: 8 })
    expect(pieces[0].points[0]).toEqual(centre('152').map(r1))
    expect(pieces[2].points[pieces[2].points.length - 1]).toEqual(centre('160').map(r1))
  })

  it('Annulla tratto takes back a whole gesture, then one piece at a time on a loaded drawing', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('img', { name: 'Davanti' })
    await paint(front, centre('110'), centre('112'))
    await paint(front, centre('152'), centre('160'))
    expect(document.querySelectorAll('.stroke')).toHaveLength(5)
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(document.querySelectorAll('.stroke')).toHaveLength(2)
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(document.querySelectorAll('.stroke')).toHaveLength(0)
  })

  it('two fingers pan and pinch without painting; the zoom opens on the current layer', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Spalla sx' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const svg = screen.getByRole('img', { name: 'Davanti' })
    const k = Number(svg.getAttribute('data-k'))
    const ty = Number(svg.getAttribute('data-ty'))
    // Mirror is on: the view centres on both shoulders, whose hand-drawn polygons differ a little in height.
    const shoulderY = (centre('130')[1] + centre('131')[1]) / 2
    expect(ty + k * shoulderY).toBeCloseTo(160, 0)
    // A finger down, then a second one: the first stroke is dropped, the pair pans.
    await fireEvent.pointerDown(svg, finger(1, { clientX: 100, clientY: 100 }))
    await fireEvent.pointerMove(svg, finger(1, { clientX: 105, clientY: 100 }))
    await fireEvent.pointerDown(svg, finger(2, { clientX: 140, clientY: 100 }))
    await fireEvent.pointerMove(svg, finger(1, { clientX: 125, clientY: 130 }))
    await fireEvent.pointerMove(svg, finger(2, { clientX: 160, clientY: 130 }))
    expect(Number(svg.getAttribute('data-k'))).toBeCloseTo(k, 5)
    expect(Number(svg.getAttribute('data-ty'))).toBeCloseTo(ty + 30, 5)
    // Spreading the fingers zooms in around them.
    await fireEvent.pointerMove(svg, finger(2, { clientX: 195, clientY: 130 }))
    expect(Number(svg.getAttribute('data-k'))).toBeCloseTo(k * 2, 5)
    await fireEvent.pointerUp(svg, finger(2, { clientX: 195, clientY: 130 }))
    await fireEvent.pointerMove(svg, finger(1, { clientX: 130, clientY: 140 }))
    await fireEvent.pointerUp(svg, finger(1, { clientX: 130, clientY: 140 }))
    expect(document.querySelectorAll('.stroke')).toHaveLength(0)
    // Every finger up: painting works again.
    await fireEvent.pointerDown(svg, finger(1, { clientX: 100, clientY: 100 }))
    await fireEvent.pointerUp(svg, finger(1, { clientX: 100, clientY: 100 }))
    expect(document.querySelectorAll('.stroke')).toHaveLength(1)
  })

  it('full body takes strokes without touching the regions, and Cancella disegno is undoable', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Tutto il corpo' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const svg = screen.getByRole('img', { name: 'Davanti' })
    await paint(svg, centre('110'), centre('112'))
    await paint(svg, centre('152'), centre('154'))
    expect(document.querySelectorAll('.stroke')).toHaveLength(4)
    await fireEvent.click(screen.getByRole('button', { name: 'Cancella disegno' }))
    expect(document.querySelectorAll('.stroke')).toHaveLength(0)
    expect(await screen.findByText('Disegno cancellato')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(document.querySelectorAll('.stroke')).toHaveLength(4)
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers[0].regions).toEqual(['*'])
    expect(e.layers[0].strokes).toHaveLength(4)
  })

  it('deselecting a painted segment takes its paint along, with undo; the rest of the drawing stays', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const svg = screen.getByRole('img', { name: 'Davanti' })
    await paint(svg, centre('152'), centre('160'))
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    expect(screen.getByText('gamba sx')).toBeInTheDocument()
    const knee = () => screen.getByRole('button', { name: regionLabel('154', t) })
    await fireEvent.click(knee())
    expect(document.querySelectorAll('.stroke')).toHaveLength(2)
    expect(knee()).toHaveAttribute('aria-pressed', 'false')
    expect(await screen.findByText('Tratti cancellati')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(document.querySelectorAll('.stroke')).toHaveLength(3)
    expect(knee()).toHaveAttribute('aria-pressed', 'true')
    // Deselecting a segment that was only tapped shows no toast: nothing was lost.
    await fireEvent.click(screen.getByRole('button', { name: regionLabel('110', t) }))
    await fireEvent.click(screen.getByRole('button', { name: regionLabel('110', t) }))
    expect(document.querySelectorAll('.stroke')).toHaveLength(3)
  })

  it('a stroke drawn on the other figure keeps its regions but is not drawn on this one', async () => {
    const stroke: Stroke = { region: '152', fig: 'male', view: 'front', points: [[100, 300]], w: 8 }
    // A piece tagged with a segment this build does not know is skipped, not fatal.
    const alien: Stroke = { region: '999', fig: 'female', view: 'front', points: [[100, 300]], w: 8 }
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 6 }, strokes: [stroke, alien] }] })
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Diario' }))
    await fireEvent.click(await screen.findByText('gamba sx'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(document.querySelectorAll('.stroke')).toHaveLength(0)
    prefs.figure = 'male'
    await waitFor(() => expect(document.querySelectorAll('.stroke')).toHaveLength(1))
    prefs.figure = 'female'
  })
})
