import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { go, episodeItems, openEpisode, salva } from '../test/nav'
import App from '../App.svelte'
import { LEG_IDS } from '../lib/regions'
import { addEntry } from '../lib/entries'
import { resetLog, heads, lastUpdate, more, body } from '../test/log'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetLog()
})

describe('Headline reading', () => {
  it('shows swelling as the headline when pain is 0', async () => {
    render(App)
    await more()
    await fireEvent.input(await screen.findByRole('slider', { name: 'Gonfiore' }), { target: { value: '3' } })
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '0' } })
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    await go('Diario')
    const row = (await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0]
    expect(row).toHaveAccessibleName(/3\s*gonfiore/)
  })

  it('the episode sheet has a slider per symptom and Aggiorna updates all of them', async () => {
    render(App)
    await more()
    await fireEvent.input(await screen.findByRole('slider', { name: 'Gonfiore' }), { target: { value: '3' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    await salva()
    const sheet = await openEpisode()
    expect(within(sheet).getByRole('slider', { name: 'Dolore' })).toHaveValue('5')
    expect(within(sheet).queryByRole('slider', { name: 'Stanchezza' })).not.toBeInTheDocument()
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Gonfiore' }), { target: { value: '6' } })
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '2' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => {
      expect((await lastUpdate())?.layers[0].readings).toEqual({ pain: 2, swelling: 6 })
      // The head is the start and stays so.
      expect((await heads())[0].layers[0].readings).toEqual({ pain: 5, swelling: 3 })
    })
    // The card now leads with swelling, the highest reading.
    await waitFor(async () => expect((await episodeItems())[0]).toHaveTextContent(/^6\s*gonfiore/))
  })
})

describe('No special symptom (#36)', () => {
  it('with pain off, the first body symptom is the headline: it starts blank, it is what gets saved', async () => {
    await db.symptoms.update('pain', { enabled: false })
    render(App)
    const head = await screen.findByRole('slider', { name: 'Gonfiore' })
    expect(head).toHaveAttribute('aria-valuetext', 'non indicato')
    expect(screen.queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
    await more()
    expect(await screen.findByRole('slider', { name: 'Pesantezza' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
    await body()
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.input(screen.getByRole('slider', { name: 'Gonfiore' }), { target: { value: '7' } })
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect((await db.entries.toArray())[0].layers).toEqual([{ regions: ['152', '153'], readings: { swelling: 7 }, tags: [] }])
    // The next draft starts blank, not at the last level, and is nothing to clear.
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Gonfiore' })).toHaveAttribute('aria-valuetext', 'non indicato'))
    expect(screen.queryByRole('button', { name: 'Azzera' })).toBeDisabled()
    // A second zone starts blank too.
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Spalla sx' }))
    expect(screen.getByRole('slider', { name: /^Gonfiore/ })).toHaveAttribute('aria-valuetext', 'non indicato')
  })

  it('the headline follows the vocabulary order: a symptom moved above pain leads', async () => {
    await db.symptoms.update('swelling', { order: -1 })
    render(App)
    expect(await screen.findByRole('slider', { name: 'Gonfiore' })).toHaveAttribute('aria-valuetext', 'non indicato')
    expect(screen.queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
    await more()
    expect(await screen.findByRole('slider', { name: 'Dolore' })).toHaveAttribute('aria-valuetext', 'non indicato')
  })

  it('with no body symptom on, an unlocated layer leads with the first mind symptom and starts at nothing', async () => {
    await db.symptoms.filter((s) => s.category === 'body').modify({ enabled: false })
    render(App)
    const head = await screen.findByRole('slider', { name: 'Nebbia mentale' })
    expect(head).toHaveValue('0')
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect((await db.entries.toArray())[0].layers).toEqual([{ regions: ['152', '153'], readings: {}, tags: [] }])
  })

  it('the episode sheet offers only what the episode has read, pain off', async () => {
    await db.symptoms.update('pain', { enabled: false })
    await addEntry({ kind: 'episode', layers: [{ regions: ['152'], readings: { fatigue: 4 } }] })
    render(App)
    const sheet = await openEpisode()
    // Only what the episode has read: no slider, and so no invented 0, for the headline it never had.
    expect(within(sheet).getAllByRole('slider')).toHaveLength(1)
    expect(within(sheet).getByRole('slider', { name: 'Stanchezza' })).toHaveValue('4')
    expect(within(sheet).queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
  })
})

describe('Mind and mind symptoms', () => {
  it('opens with both kinds of sliders; the mind shows the mind ones only and saves a mind layer with the mental readings, no pain', async () => {
    render(App)
    // The headline comes from the vocabulary, read after the first frame.
    await screen.findByRole('slider', { name: 'Dolore' })
    expect(screen.getByRole('slider', { name: 'Dolore' })).toBeInTheDocument()
    await more()
    expect(await screen.findByRole('slider', { name: 'Nebbia mentale' })).toBeInTheDocument()
    await body()
    const mind = screen.getByRole('button', { name: 'Mente' })
    expect(mind).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(mind)
    expect(screen.getByRole('button', { name: 'Mente' })).toHaveAttribute('aria-pressed', 'true')
    // A mind-only layer leads with its first mind symptom: it takes the frame, the others wait on the Altro face.
    expect(screen.queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Gonfiore' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Ansia' })).not.toBeInTheDocument()
    await fireEvent.input(screen.getByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '6' } })
    await more()
    expect(screen.getByRole('slider', { name: 'Ansia' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Nebbia mentale' })).toHaveValue('6')
    expect(screen.queryByRole('slider', { name: 'Gonfiore' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /6\s*nebbia mentale · mente/ })).toHaveAttribute('aria-pressed', 'true')
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toEqual([{ regions: ['mind'], readings: { fog: 6 }, tags: [] }])
    // The form is back to both kinds, blank again.
    expect(await screen.findByRole('slider', { name: 'Dolore' })).toHaveAttribute('aria-valuetext', 'non indicato')
    await go('Diario')
    const row = (await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0]
    expect(row).toHaveAccessibleName(/6\s*nebbia mentale · mente/)
  })

  it('a body region alone shows the body sliders only; the mind joins its layer, one pill for both, pain still editing the body', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await more()
    await screen.findByRole('slider', { name: 'Gonfiore' })
    expect(screen.queryByRole('slider', { name: 'Nebbia mentale' })).not.toBeInTheDocument()
    await body()
    await fireEvent.click(screen.getByRole('button', { name: 'Mente' }))
    // Both sets now, and still one chip: the mind sits with the legs at their level.
    await more()
    await fireEvent.input(await screen.findByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '4' } })
    expect(screen.getByRole('slider', { name: 'Gonfiore' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /mente/ })).toHaveLength(1)
    // Pain not set yet: the fog leads the chip.
    expect(screen.getByRole('button', { name: /4\s*nebbia mentale · cosce, mente/ })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '7' } })
    expect(screen.getByRole('button', { name: /7\s*cosce, mente/ })).toHaveAttribute('aria-pressed', 'true')
    // A knee joins the same layer; the mind slider stays.
    await body()
    await fireEvent.click(screen.getByRole('button', { name: 'Ginocchio sx' }))
    expect(screen.getByRole('button', { name: /7\s*cosce, ginocchia, mente/ })).toHaveAttribute('aria-pressed', 'true')
    await more()
    expect(screen.getByRole('slider', { name: 'Nebbia mentale' })).toHaveValue('4')
    await body()
    await fireEvent.click(screen.getByRole('button', { name: 'Tutto il corpo' }))
    expect(screen.getByRole('button', { name: 'Mente' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /7\s*tutto il corpo, mente/ })).toHaveAttribute('aria-pressed', 'true')
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toEqual([{ regions: ['*', 'mind'], readings: { pain: 7, fog: 4 }, tags: [] }])
    await go('Diario')
    const row = (await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0]
    expect(row).toHaveAccessibleName(/7\s*tutto il corpo, mente/)
  })

  it('the mind first, then a leg: the leg joins the mind, the chip reads the layer headline and the pain slider comes back', async () => {
    render(App)
    // A mind-only layer leads with its own sliders: they are on the peek, no handle needed.
    await fireEvent.click(screen.getByRole('button', { name: 'Mente' }))
    expect(screen.getByRole('button', { name: /^Altro/ })).toHaveAttribute('aria-expanded', 'false')
    await fireEvent.input(await screen.findByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '6' } })
    expect(screen.getByRole('button', { name: /6\s*nebbia mentale · mente/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await more()
    // Fog 6 leads, pain not set: the chip is the layer's headline, named like the diary pill.
    expect(screen.getByRole('button', { name: /6\s*nebbia mentale · cosce, mente/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button', { name: /mente/ })).toHaveLength(1)
    expect(await screen.findByRole('slider', { name: 'Dolore' })).toHaveAttribute('aria-valuetext', 'non indicato')
    expect(screen.getByRole('slider', { name: 'Nebbia mentale' })).toHaveValue('6')
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '8' } })
    expect(screen.getByRole('button', { name: /8\s*cosce, mente/ })).toBeInTheDocument()
    // The mind leaves: the legs stay at their level, the mental sliders fold away and their reading does not reach the entry.
    await body()
    await fireEvent.click(screen.getByRole('button', { name: 'Mente' }))
    expect(screen.getByRole('button', { name: /8\s*cosce$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('slider', { name: 'Nebbia mentale' })).not.toBeInTheDocument()
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toEqual([{ regions: ['152', '153'], readings: { pain: 8 }, tags: [] }])
  })

  it('outlines what the one layer holds, so a pale low level still shows where the tap landed (#23)', async () => {
    render(App)
    const thigh = () => document.querySelector('.region[data-region="152"]')
    expect(thigh()).not.toHaveClass('hi')
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    expect(thigh()).toHaveClass('hi')
    // The whole body is plain enough without a line round every segment.
    await fireEvent.click(screen.getByRole('button', { name: 'Tutto il corpo' }))
    expect(thigh()).not.toHaveClass('hi')
  })

  it('a second layer over the same legs keeps its own readings and tags, and the map fades the other layer', async () => {
    render(App)
    // The headline comes from the vocabulary, read after the first frame.
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '7' } })
    await more()
    await fireEvent.click(await screen.findByRole('button', { name: 'Compressione' }))
    // + Altra zona brings the figure back: the next thing to do is choose where.
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    expect(screen.getByRole('button', { name: /^Altro/ })).toHaveAttribute('aria-expanded', 'false')
    // The new layer: nothing selected yet, its own sliders and tags.
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('.region[data-region="152"]')).toHaveClass('ghost')
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    expect(document.querySelector('.region[data-region="152"]')).not.toHaveClass('ghost')
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '0' } })
    await more()
    expect(screen.getByRole('button', { name: 'Compressione' })).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.input(screen.getByRole('slider', { name: 'Gonfiore' }), { target: { value: '6' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Impacco caldo' }))
    expect(screen.getByRole('button', { name: /6\s*gonfiore · cosce · Impacco caldo/ })).toHaveAttribute('aria-pressed', 'true')
    // Back on the first layer: the legs are still all there, with their tag.
    await fireEvent.click(screen.getByRole('button', { name: /7\s*gambe · Compressione/ }))
    expect(screen.getByRole('button', { name: 'Compressione' })).toHaveAttribute('aria-pressed', 'true')
    await body()
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('slider', { name: /^Dolore/ })).toHaveValue('7')
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers).toEqual([
      { regions: [...LEG_IDS].sort(), readings: { pain: 7 }, tags: ['compression'] },
      { regions: ['152', '153'], readings: { pain: 0, swelling: 6 }, tags: ['heat'] },
    ])
    await go('Diario')
    const row = (await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0]
    expect(row).toHaveAccessibleName(/7\s*gambe 7 · cosce 6 gonfiore · Compressione · Impacco caldo/)
  })

  it('a mind-only episode is updated from its sheet without a pain slider', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Mente' }))
    await fireEvent.input(await screen.findByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '6' } })
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    await salva()
    expect((await episodeItems())[0]).toHaveTextContent(/^6\s*nebbia mentale · mente/)
    const sheet = await openEpisode()
    expect(within(sheet).queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '2' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => {
      expect((await lastUpdate())?.layers).toEqual([{ regions: ['mind'], readings: { fog: 2 }, tags: [] }])
    })
  })
})
