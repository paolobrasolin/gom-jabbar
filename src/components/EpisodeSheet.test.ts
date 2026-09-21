import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addEntry, updateEpisode } from '../lib/entries'
import App from '../App.svelte'
import { mergedTags } from '../lib/layers'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
})

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

/** An episode started 3h ago at 7, updated to 4 an hour ago. */
async function seedEpisode() {
  const e = await addEntry({ at: ago(180), ongoing: true, layers: [{ regions: ['152'], readings: { pain: 7 } }] })
  await updateEpisode(e.id, [{ pain: 4 }], ago(60))
  return e.id
}
async function openSheet() {
  render(App)
  await fireEvent.click(await screen.findByRole('button', { name: 'Episodio in corso' }))
  return screen.findByRole('dialog', { name: 'Episodio in corso' })
}

describe('Episode sheet', () => {
  it('shows where the episode started and every history point', async () => {
    await seedEpisode()
    const sheet = await openSheet()
    expect(sheet).toHaveTextContent('gamba sx')
    expect(sheet).toHaveTextContent('da 3h')
    const points = Array.from(sheet.querySelectorAll('.history span')).map((s) => s.textContent)
    expect(points).toHaveLength(2)
    expect(points[0]).toMatch(/^\d\d:\d\d 7$/)
    expect(points[1]).toMatch(/^\d\d:\d\d 4$/)
    expect(within(sheet).getByRole('slider', { name: 'Dolore' })).toHaveValue('4')
  })

  it('Aggiorna appends a point and undo puts the readings back', async () => {
    const id = await seedEpisode()
    const sheet = await openSheet()
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '2' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => {
      const e = await db.entries.get(id)
      expect(e?.layers[0].readings.pain).toBe(2)
      expect(e?.history).toHaveLength(3)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Intensità aggiornata')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(async () => {
      const e = await db.entries.get(id)
      expect(e?.layers[0].readings.pain).toBe(4)
      expect(e?.history).toHaveLength(2)
    })
  })

  it('Termina records the remedies and undo reopens the episode with its old tags', async () => {
    const id = await seedEpisode()
    const sheet = await openSheet()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Calore' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Termina adesso' }))
    await waitFor(async () => {
      const e = await db.entries.get(id)
      expect(e?.ongoing).toBe(false)
      expect(e?.endedAt).not.toBeNull()
      expect(mergedTags(e!.layers)).toEqual(['heat'])
    })
    expect(await screen.findByText('Episodio terminato')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(async () => {
      const e = await db.entries.get(id)
      expect(e?.ongoing).toBe(true)
      expect(e?.endedAt).toBeNull()
      expect(mergedTags(e!.layers)).toEqual([])
    })
    expect(await screen.findByRole('button', { name: 'Episodio in corso' })).toBeInTheDocument()
  })

  it('Modifica hands the entry to the edit sheet', async () => {
    await seedEpisode()
    const sheet = await openSheet()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Modifica zone e note' }))
    expect(screen.queryByRole('dialog', { name: 'Episodio in corso' })).not.toBeInTheDocument()
    const edit = await screen.findByRole('dialog', { name: 'Modifica' })
    expect(within(edit).getByRole('slider', { name: 'Dolore' })).toHaveValue('4')
    expect(within(edit).getByRole('button', { name: 'In corso' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('with several layers, chips pick the layer whose sliders and remedies are edited; Aggiorna saves every layer', async () => {
    const e = await addEntry({ at: ago(30), ongoing: true, layers: [{ regions: ['152'], readings: { pain: 7 } }, { regions: ['mind'], readings: { fog: 5 } }] })
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
      const cur = await db.entries.get(e.id)
      expect(cur?.layers).toEqual([{ regions: ['152'], readings: { pain: 3 }, tags: ['heat'] }, { regions: ['mind'], readings: { fog: 8 }, tags: [] }])
      expect(cur?.history?.map((h) => h.layers)).toEqual([[{ pain: 7 }, { fog: 5 }], [{ pain: 3 }, { fog: 8 }]])
    })
  })

  it('offers a slider per tracked symptom in vocabulary order, unknown symptoms last', async () => {
    await addEntry({ at: ago(30), ongoing: true, readings: { pain: 5, ghost: 4, swelling: 3, fatigue: 0 } })
    const sheet = await openSheet()
    const sliders = within(sheet).getAllByRole('slider').map((s) => s.getAttribute('aria-label'))
    expect(sliders).toEqual(['Dolore', 'Gonfiore', 'Ghost'])
    expect(sheet.querySelector('.history')).toBeNull()
  })
})
