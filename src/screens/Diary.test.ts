import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addEntry, updateEpisode, endEpisode } from '../lib/entries'
import App from '../App.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
})

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const DAY = 24 * 60

async function openDiary() {
  render(App)
  await fireEvent.click(screen.getByRole('button', { name: 'Diario' }))
}
const dayHeadings = () => Array.from(document.querySelectorAll('h2.day')).map((h) => h.textContent)
const rows = () => screen.getAllByRole('button', { name: /\d\d:\d\d/ })

describe('Diary list', () => {
  it('explains itself while there is nothing to show', async () => {
    await openDiary()
    expect(await screen.findByText('Ancora nessuna voce.')).toBeInTheDocument()
    expect(screen.getByText('Quello che registri comparirà qui.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mostra altre' })).not.toBeInTheDocument()
  })

  it('groups entries by day, newest first, with the headline in a pill', async () => {
    await addEntry({ at: ago(120), areas: [{ regions: ['thigh.l', 'thigh.r'], intensity: 3 }] })
    await addEntry({ at: ago(10), areas: [{ regions: ['thigh.l'], intensity: 7 }] })
    await addEntry({ at: ago(DAY + 60), areas: [{ regions: ['shoulder.l'], intensity: 5 }] })
    await openDiary()
    await waitFor(() => expect(dayHeadings()).toEqual(['Oggi', 'Ieri']))
    const r = rows()
    expect(r).toHaveLength(3)
    expect(r[0].querySelector('.pill')).toHaveTextContent('7')
    expect(r[0]).toHaveTextContent('gamba sx')
    expect(r[1].querySelector('.pill')).toHaveTextContent('3')
    expect(r[1]).toHaveTextContent('gambe')
    expect(r[2]).toHaveTextContent('braccio sx')
  })

  it('shows the symptom name, tags, duration, level trail and note of an episode', async () => {
    const e = await addEntry({ at: ago(180), ongoing: true, areas: [{ regions: ['thigh.l'], intensity: 7 }], tags: ['rest'], note: 'dopo la corsa' })
    await updateEpisode(e.id, { pain: 4 }, ago(120))
    await endEpisode(e.id, ago(60))
    await addEntry({ at: ago(30), ongoing: true, readings: { pain: 2, swelling: 6 } })
    await openDiary()
    await waitFor(() => expect(rows()).toHaveLength(2))
    const [swelling, episode] = rows()
    expect(swelling.querySelector('.pill')).toHaveTextContent('6')
    await waitFor(() => expect(swelling).toHaveTextContent('gonfiore'))
    expect(swelling).toHaveTextContent('in corso')
    expect(episode.querySelector('.pill')).toHaveTextContent('4')
    expect(episode).toHaveTextContent('gamba sx · Riposo')
    expect(episode).toHaveTextContent('2h · 7 → 4')
    expect(episode).toHaveTextContent('dopo la corsa')
  })

  it('shows 30 days and loads 60 more at a time while older entries exist', async () => {
    await addEntry({ at: ago(10), areas: [{ regions: ['thigh.l'], intensity: 2 }] })
    await addEntry({ at: ago(40 * DAY), areas: [{ regions: ['thigh.l'], intensity: 9 }] })
    await addEntry({ at: ago(100 * DAY), areas: [{ regions: ['thigh.l'], intensity: 8 }] })
    await openDiary()
    await waitFor(() => expect(rows()).toHaveLength(1))
    const more = screen.getByRole('button', { name: 'Mostra altre' })
    await fireEvent.click(more)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(rows()[1].querySelector('.pill')).toHaveTextContent('9')
    await fireEvent.click(screen.getByRole('button', { name: 'Mostra altre' }))
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(screen.queryByRole('button', { name: 'Mostra altre' })).not.toBeInTheDocument()
  })
})

describe('Edit sheet', () => {
  it('opens prefilled from a row and saves the changes', async () => {
    const e = await addEntry({ at: ago(60), areas: [{ regions: ['thigh.l'], intensity: 7 }], tags: ['rest'], note: 'dopo la corsa' })
    await openDiary()
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d.*gamba sx/ }))[0])
    const sheet = await screen.findByRole('dialog', { name: 'Modifica' })
    expect(within(sheet).getByRole('slider', { name: 'Dolore' })).toHaveValue('7')
    expect(within(sheet).getByRole('textbox', { name: 'Note' })).toHaveValue('dopo la corsa')
    expect(await within(sheet).findByRole('button', { name: 'Riposo' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByRole('button', { name: 'Coscia sx' })).toHaveAttribute('aria-pressed', 'true')

    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '3' } })
    await fireEvent.input(within(sheet).getByRole('textbox', { name: 'Note' }), { target: { value: 'meglio' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Calore' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => {
      const cur = await db.entries.get(e.id)
      expect(cur?.readings.pain).toBe(3)
      expect(cur?.areas).toEqual([{ regions: ['thigh.l'], intensity: 3 }])
      expect(cur?.note).toBe('meglio')
      expect(cur?.tags).toEqual(['rest', 'heat'])
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Salvato')).toBeInTheDocument()
    await waitFor(() => expect(rows()[0].querySelector('.pill')).toHaveTextContent('3'))
    expect(rows()[0]).toHaveTextContent('meglio')
  })

  it('deletes with undo', async () => {
    await addEntry({ at: ago(60), areas: [{ regions: ['thigh.l'], intensity: 7 }] })
    await openDiary()
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d.*gamba sx/ }))[0])
    const sheet = await screen.findByRole('dialog', { name: 'Modifica' })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Elimina' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(0))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Ancora nessuna voce.')).toBeInTheDocument()
    await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect(await screen.findAllByRole('button', { name: /\d\d:\d\d.*gamba sx/ })).toHaveLength(1)
  })

  it('ends an episode when "In corso" is switched off, and reopens one when switched on', async () => {
    const e = await addEntry({ at: ago(60), ongoing: true, areas: [{ regions: ['thigh.l'], intensity: 7 }] })
    await openDiary()
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d.*gamba sx/ }))[0])
    let sheet = await screen.findByRole('dialog', { name: 'Modifica' })
    const ongoing = within(sheet).getByRole('button', { name: 'In corso' })
    expect(ongoing).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(ongoing)
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => {
      const cur = await db.entries.get(e.id)
      expect(cur?.ongoing).toBe(false)
      expect(cur?.endedAt).not.toBeNull()
    })
    await waitFor(() => expect(rows()[0]).not.toHaveTextContent('in corso'))

    await fireEvent.click(rows()[0])
    sheet = await screen.findByRole('dialog', { name: 'Modifica' })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'In corso' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => {
      const cur = await db.entries.get(e.id)
      expect(cur?.ongoing).toBe(true)
      expect(cur?.endedAt).toBeNull()
    })
    await waitFor(() => expect(rows()[0]).toHaveTextContent('in corso'))
  })

  it('closes on Escape without touching the entry', async () => {
    const e = await addEntry({ at: ago(60), areas: [{ regions: ['thigh.l'], intensity: 7 }] })
    await openDiary()
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d.*gamba sx/ }))[0])
    const sheet = await screen.findByRole('dialog', { name: 'Modifica' })
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '1' } })
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await db.entries.get(e.id))?.readings.pain).toBe(7)
  })
})
