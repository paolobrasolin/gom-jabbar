import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addEntry, logUpdate, endEpisode, isHead, isUpdate } from '../lib/entries'
import { go, openEpisode, episodesButton } from '../test/nav'
import App from '../App.svelte'
import { mergedTags } from '../lib/layers'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
  // The lines say "oggi" and "ieri" by the calendar: at 15:00 a reading an hour or three ago is today, whatever the real clock says.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 30, 15, 0))
})
afterEach(() => {
  vi.useRealTimers()
})

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const updates = async () => (await db.entries.toArray()).filter(isUpdate).sort((a, b) => a.at.localeCompare(b.at))

/** An episode started 3h ago at 7, updated to 4 an hour ago. */
async function seedEpisode() {
  const e = await addEntry({ at: ago(180), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 7 } }] })
  await logUpdate(e.id, [{ pain: 4 }], ago(60))
  return e.id
}
/** The readings of the sheet, one line each, whitespace folded. */
const lines = (sheet: HTMLElement) => within(within(sheet).getByLabelText('Letture')).getAllByRole('button').map((b) => b.textContent!.replace(/\s+/g, ' ').trim())
async function openSheet() {
  render(App)
  return openEpisode()
}

describe('Episode sheet', () => {
  it('shows where the episode stands and every reading of it', async () => {
    await seedEpisode()
    const sheet = await openSheet()
    expect(sheet).toHaveTextContent('coscia sx')
    expect(sheet).toHaveTextContent('da 3h')
    // Each reading names its symptom, pain included, so a switch between symptoms shows.
    expect(lines(sheet)).toHaveLength(2)
    expect(lines(sheet)[0]).toMatch(/^\d\d:\d\d 7 dolore · coscia sx$/)
    expect(lines(sheet)[1]).toMatch(/^\d\d:\d\d 4 dolore · coscia sx$/)
    expect(within(sheet).getByText("Com'è adesso")).toBeInTheDocument()
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
    await waitFor(() => expect(episodesButton()).toBeInTheDocument())
  })

  it('Termina with nothing changed only sets the end', async () => {
    const id = await seedEpisode()
    const sheet = await openSheet()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Termina adesso' }))
    await waitFor(async () => expect((await db.entries.get(id))?.endedAt).not.toBeNull())
    expect(await updates()).toHaveLength(1)
    // The ended episode's sheet, from the diary, has the readings and the edit link but no sliders.
    await go('Diario')
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
    const ended = await screen.findByRole('dialog', { name: 'Episodio' })
    expect(within(ended).getByLabelText('Letture')).toBeInTheDocument()
    expect(within(ended).queryByRole('slider')).not.toBeInTheDocument()
    expect(within(ended).queryByRole('button', { name: 'Aggiorna' })).not.toBeInTheDocument()
    // Each reading is edited from its own line: no Modifica beside a summary it would not open.
    expect(within(ended).queryByRole('button', { name: 'Modifica' })).not.toBeInTheDocument()
  })

  it('a reading is an entry: its line opens it, and an edit shows on that line and nowhere else', async () => {
    await seedEpisode()
    let sheet = await openSheet()
    expect(within(sheet).queryByRole('button', { name: 'Modifica' })).not.toBeInTheDocument()
    await fireEvent.click(within(within(sheet).getByLabelText('Letture')).getAllByRole('button')[0])
    const edit = await screen.findByRole('dialog', { name: 'Modifica' })
    expect(within(edit).getByRole('slider', { name: 'Dolore' })).toHaveValue('7')
    // The start moves to the right thigh; the update keeps the left one.
    await fireEvent.click(within(edit).getByRole('button', { name: 'Coscia sx' }))
    await fireEvent.click(within(edit).getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.click(within(edit).getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    sheet = await openEpisode()
    expect(lines(sheet)[0]).toMatch(/^\d\d:\d\d 7 dolore · coscia dx$/)
    expect(lines(sheet)[1]).toMatch(/^\d\d:\d\d 4 dolore · coscia sx$/)
  })

  it('an ended episode with one reading: its level, when it ended, and Modifica; the title is not the toast', async () => {
    const e = await addEntry({ at: ago(300), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 6 } }] })
    await endEpisode(e.id, ago(180))
    render(App)
    await go('Diario')
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
    const sheet = await screen.findByRole('dialog', { name: 'Episodio' })
    expect(within(sheet).getByText('6')).toHaveClass('pill')
    expect(sheet).toHaveTextContent(/2h · finito alle 12:00/)
    expect(within(sheet).getByRole('button', { name: 'Modifica' })).toBeInTheDocument()
  })

  it('an episode that ended on another day says which', async () => {
    const e = await addEntry({ at: ago(36 * 60), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 6 } }] })
    await endEpisode(e.id, ago(30 * 60))
    render(App)
    await go('Diario')
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
    expect(await screen.findByRole('dialog', { name: 'Episodio' })).toHaveTextContent(/6h · finito ieri alle 09:00/)
  })

  it('Modifica hands the head to the edit sheet while it is the only reading', async () => {
    await addEntry({ at: ago(180), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 7 } }] })
    const sheet = await openSheet()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Modifica' }))
    expect(screen.queryByRole('dialog', { name: 'Episodio in corso' })).not.toBeInTheDocument()
    const edit = await screen.findByRole('dialog', { name: 'Modifica' })
    expect(within(edit).getByRole('slider', { name: 'Dolore' })).toHaveValue('7')
    await fireEvent.click(within(edit).getByRole('button', { name: /^Altro/ }))
    expect(within(edit).getByRole('button', { name: 'Episodio' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(within(edit).getByRole('group', { name: 'Fine' })).getByRole('button', { name: 'In corso' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('with several layers, chips pick the layer whose sliders and remedies are edited; Aggiorna saves every layer', async () => {
    const e = await addEntry({ at: ago(30), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 7 } }, { regions: ['mind'], readings: { fog: 5 } }] })
    const sheet = await openSheet()
    const chips = within(sheet).getAllByRole('button', { name: /^\d\s/ })
    expect(chips.map((c) => c.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['7 coscia sx', '5 nebbia mentale · mente'])
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

describe('what an update carries', () => {
  it('chips start unpressed even when the last reading took them: a tap is a new dose', async () => {
    const e = await addEntry({ at: ago(180), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 7 } }] })
    await logUpdate(e.id, [{ pain: 5 }], ago(60), [['heat']])
    const sheet = await openSheet()
    expect(within(sheet).getByRole('button', { name: 'Calore' })).toHaveAttribute('aria-pressed', 'false')
    expect(lines(sheet)[1]).toMatch(/^\d\d:\d\d 5 dolore · coscia sx · Calore$/)
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Calore' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => expect((await updates()).map((u) => u.layers[0].tags)).toEqual([['heat'], ['heat']]))
  })

  it("the start's context stays on the start: shown in the summary, never copied", async () => {
    const e = await addEntry({ at: ago(180), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 7 }, tags: ['badsleep'] }] })
    const sheet = await openSheet()
    expect(sheet).toHaveTextContent('da 3h · Dormito male')
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => expect((await updates()).map((u) => u.layers)).toEqual([[{ regions: ['152'], readings: { pain: 7 }, tags: [] }]]))
    expect((await db.entries.get(e.id))?.layers[0].tags).toEqual(['badsleep'])
  })

  it('an episode that never read pain gets no pain slider, and no pain 0', async () => {
    await addEntry({ at: ago(60), kind: 'episode', layers: [{ regions: ['152'], readings: { swelling: 5 } }] })
    const sheet = await openSheet()
    expect(within(sheet).getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['Gonfiore'])
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => expect((await updates()).map((u) => u.layers[0].readings)).toEqual([{ swelling: 5 }]))
  })

  it('a note goes with the update and shows on its line', async () => {
    await seedEpisode()
    let sheet = await openSheet()
    await fireEvent.input(within(sheet).getByRole('textbox', { name: 'Note' }), { target: { value: 'meglio dopo il caffè' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => expect((await updates()).map((u) => u.note)).toEqual(['', 'meglio dopo il caffè']))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    sheet = await openEpisode()
    expect(lines(sheet)[2]).toMatch(/^\d\d:\d\d 4 dolore · coscia sx · meglio dopo il caffè$/)
    expect(within(sheet).getByRole('textbox', { name: 'Note' })).toHaveValue('')
  })

  it('an episode over more than one day says the day on its readings', async () => {
    const e = await addEntry({ at: ago(60 * 50), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 7 } }] })
    await logUpdate(e.id, [{ pain: 4 }], ago(30))
    const sheet = await openSheet()
    expect(lines(sheet)[0]).not.toMatch(/^\d\d:\d\d /)
    expect(lines(sheet)[1]).toMatch(/^oggi \d\d:\d\d 4 dolore · coscia sx$/i)
  })
})

describe('a migrated episode', () => {
  it('Aggiorna keeps the mental reading on the body layer, and the sheet offers its slider', async () => {
    const at = ago(120)
    await db.entries.add({ id: 'm1', kind: 'episode', episodeId: 'm1', endedAt: null, at, layers: [{ regions: ['152'], readings: { pain: 5, fog: 3 }, tags: [] }], note: '', createdAt: at, updatedAt: at })
    const sheet = await openSheet()
    expect(within(sheet).getByRole('slider', { name: 'Nebbia mentale' })).toHaveValue('3')
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '6' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => expect((await updates())[0]?.layers[0].readings).toEqual({ pain: 6, fog: 3 }))
  })
})
