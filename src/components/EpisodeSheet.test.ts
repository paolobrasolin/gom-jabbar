import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addEntry, logUpdate, isHead, isUpdate } from '../lib/entries'
import App from '../App.svelte'
import { mergedTags } from '../lib/layers'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
})

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const updates = async () => (await db.entries.toArray()).filter(isUpdate).sort((a, b) => a.at.localeCompare(b.at))

/** An episode started 3h ago at 7, updated to 4 an hour ago. */
async function seedEpisode() {
  const e = await addEntry({ at: ago(180), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 7 } }] })
  await logUpdate(e.id, [{ pain: 4 }], ago(60))
  return e.id
}
async function openSheet() {
  render(App)
  await fireEvent.click(await screen.findByRole('button', { name: 'Episodio in corso' }))
  return screen.findByRole('dialog', { name: 'Episodio in corso' })
}

describe('Episode sheet', () => {
  it('shows where the episode stands and every reading of it', async () => {
    await seedEpisode()
    const sheet = await openSheet()
    expect(sheet).toHaveTextContent('gamba sx')
    expect(sheet).toHaveTextContent('da 3h')
    const points = within(within(sheet).getByLabelText('Letture')).getAllByRole('button').map((s) => s.textContent?.trim())
    expect(points).toHaveLength(2)
    expect(points[0]).toMatch(/^\d\d:\d\d 7$/)
    expect(points[1]).toMatch(/^\d\d:\d\d 4$/)
    expect(within(sheet).getByRole('slider', { name: 'Dolore' })).toHaveValue('4')
  })

  it('Aggiorna logs a reading and undo takes it back', async () => {
    const id = await seedEpisode()
    const sheet = await openSheet()
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '2' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => {
      const u = await updates()
      expect(u).toHaveLength(2)
      expect(u[1]).toMatchObject({ episodeId: id, layers: [{ regions: ['152'], readings: { pain: 2 }, tags: [] }] })
    })
    // The head is the start and does not move.
    expect((await db.entries.get(id))?.layers[0].readings.pain).toBe(7)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Intensità aggiornata')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await updates()).toHaveLength(1))
  })

  it('Termina records the remedies as one more reading and undo reopens the episode without it', async () => {
    const id = await seedEpisode()
    const sheet = await openSheet()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Calore' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Termina adesso' }))
    await waitFor(async () => {
      expect((await db.entries.get(id))?.endedAt).not.toBeNull()
      const u = await updates()
      expect(u).toHaveLength(2)
      expect(mergedTags(u[1].layers)).toEqual(['heat'])
    })
    expect(await screen.findByText('Episodio terminato')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(async () => {
      expect((await db.entries.get(id))?.endedAt).toBeNull()
      expect(await updates()).toHaveLength(1)
    })
    expect(await screen.findByRole('button', { name: 'Episodio in corso' })).toBeInTheDocument()
  })

  it('Termina with nothing changed only sets the end', async () => {
    const id = await seedEpisode()
    const sheet = await openSheet()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Termina adesso' }))
    await waitFor(async () => expect((await db.entries.get(id))?.endedAt).not.toBeNull())
    expect(await updates()).toHaveLength(1)
    // The ended episode's sheet, from the diary, has the readings and the edit link but no sliders.
    await fireEvent.click(screen.getByRole('button', { name: 'Diario' }))
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
    const ended = await screen.findByRole('dialog', { name: 'Episodio terminato' })
    expect(within(ended).getByLabelText('Letture')).toBeInTheDocument()
    expect(within(ended).queryByRole('slider')).not.toBeInTheDocument()
    expect(within(ended).queryByRole('button', { name: 'Aggiorna' })).not.toBeInTheDocument()
    expect(within(ended).getByRole('button', { name: 'Modifica zone e note' })).toBeInTheDocument()
  })

  it('Modifica hands the head to the edit sheet', async () => {
    await seedEpisode()
    const sheet = await openSheet()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Modifica zone e note' }))
    expect(screen.queryByRole('dialog', { name: 'Episodio in corso' })).not.toBeInTheDocument()
    const edit = await screen.findByRole('dialog', { name: 'Modifica' })
    expect(within(edit).getByRole('slider', { name: 'Dolore' })).toHaveValue('7')
    expect(within(edit).getByRole('button', { name: 'Episodio' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(within(edit).getByRole('group', { name: 'Fine' })).getByRole('button', { name: 'In corso' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('with several layers, chips pick the layer whose sliders and remedies are edited; Aggiorna saves every layer', async () => {
    const e = await addEntry({ at: ago(30), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 7 } }, { regions: ['mind'], readings: { fog: 5 } }] })
    const sheet = await openSheet()
    const chips = within(sheet).getAllByRole('button', { name: /^\d\s/ })
    expect(chips.map((c) => c.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['7 gamba sx', '5 nebbia mentale · mente'])
    expect(within(sheet).getByRole('slider', { name: 'Dolore' })).toHaveValue('7')
    expect(within(sheet).queryByRole('slider', { name: 'Nebbia mentale' })).not.toBeInTheDocument()
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '3' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Calore' }))
    await fireEvent.click(chips[1])
    expect(within(sheet).queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '8' } })
    expect(within(sheet).getByRole('button', { name: 'Calore' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(sheet).getByRole('button', { name: /8\s*nebbia mentale · mente/ })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => {
      const [u] = await updates()
      expect(u?.layers).toEqual([{ regions: ['152'], readings: { pain: 3 }, tags: ['heat'] }, { regions: ['mind'], readings: { fog: 8 }, tags: [] }])
    })
    expect((await db.entries.toArray()).filter(isHead).map((h) => h.id)).toEqual([e.id])
  })

  it('offers a slider per tracked symptom in vocabulary order, unknown symptoms last', async () => {
    await addEntry({ at: ago(30), kind: 'episode', readings: { pain: 5, ghost: 4, swelling: 3, fatigue: 0 } })
    const sheet = await openSheet()
    const sliders = within(sheet).getAllByRole('slider').map((s) => s.getAttribute('aria-label'))
    expect(sliders).toEqual(['Dolore', 'Gonfiore', 'Ghost'])
    expect(within(sheet).queryByLabelText('Letture')).not.toBeInTheDocument()
  })
})
