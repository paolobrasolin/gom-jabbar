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
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Impacco caldo' }))
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

  it('each reading line looks tappable: it ends in a chevron, outside its name (#115)', async () => {
    await seedEpisode()
    const sheet = await openSheet()
    for (const b of within(within(sheet).getByLabelText('Letture')).getAllByRole('button')) {
      const cue = b.querySelector('svg.go')
      expect(cue).toHaveAttribute('aria-hidden', 'true')
      expect(b.lastElementChild).toBe(cue)
    }
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

  it('an ended episode leads with the worst it got; an ongoing one with how it is now', async () => {
    const e = await addEntry({ at: ago(300), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 6 } }] })
    await logUpdate(e.id, [{ pain: 9 }], ago(240))
    await logUpdate(e.id, [{ pain: 3 }], ago(200))
    let sheet = await openSheet()
    expect(sheet.querySelector('.head .pill')).toHaveTextContent('3')
    await fireEvent.keyDown(window, { key: 'Escape' })
    await endEpisode(e.id, ago(180))
    await go('Diario')
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
    sheet = await screen.findByRole('dialog', { name: 'Episodio' })
    expect(sheet.querySelector('.head .pill')).toHaveTextContent('9')
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
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Impacco caldo' }))
    await fireEvent.click(chips[1])
    expect(within(sheet).queryByRole('slider', { name: 'Dolore' })).not.toBeInTheDocument()
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Nebbia mentale' }), { target: { value: '8' } })
    expect(within(sheet).getByRole('button', { name: 'Impacco caldo' })).toHaveAttribute('aria-pressed', 'false')
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
    expect(within(sheet).getByRole('button', { name: 'Impacco caldo' })).toHaveAttribute('aria-pressed', 'false')
    expect(lines(sheet)[1]).toMatch(/^\d\d:\d\d 5 dolore · coscia sx · Impacco caldo$/)
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Impacco caldo' }))
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
    // Read aloud, the line is named without its note, which follows as the description (#34).
    const line = within(within(sheet).getByLabelText('Letture')).getAllByRole('button')[2]
    expect(line).toHaveAccessibleName(/^\d\d:\d\d.*4.*dolore · coscia sx$/)
    expect(line).toHaveAccessibleDescription('meglio dopo il caffè')
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

describe('A symptom the episode did not start with (#111)', () => {
  const fold = (sheet: HTMLElement) => within(sheet).getByRole('button', { name: 'Altri sintomi' })

  it("the layer's other symptoms wait folded under the ones read; opened, blank, and Aggiorna records the one set", async () => {
    const id = await seedEpisode()
    render(App)
    const sheet = await openEpisode()
    expect(within(sheet).getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['Dolore'])
    expect(fold(sheet)).toHaveAttribute('aria-expanded', 'false')
    await fireEvent.click(fold(sheet))
    expect(fold(sheet)).toHaveAttribute('aria-expanded', 'true')
    // The body's other symptoms, in vocabulary order, every one blank; the mind's are not this layer's.
    const names = within(sheet).getAllByRole('slider').map((s) => s.getAttribute('aria-label'))
    expect(names[0]).toBe('Dolore')
    expect(names).toContain('Gonfiore')
    expect(names).not.toContain('Nebbia mentale')
    const swelling = within(sheet).getByRole('slider', { name: 'Gonfiore' })
    expect(swelling).toHaveAttribute('aria-valuetext', 'non indicato')
    await fireEvent.input(swelling, { target: { value: '3' } })
    // Set, it stays where it was, under the fold.
    expect(within(sheet).getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(names)
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => expect(await updates()).toHaveLength(2))
    expect((await updates())[1].layers[0].readings).toEqual({ pain: 4, swelling: 3 })
    // Read now: next time it is one of the episode's own, and the fold starts closed.
    const again = await openEpisode()
    expect(within(again).getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['Dolore', 'Gonfiore'])
    expect(fold(again)).toHaveAttribute('aria-expanded', 'false')
    void id
  })

  it('Termina keeps a new symptom set to 0: a 0 chosen is a reading', async () => {
    const id = await seedEpisode()
    render(App)
    const sheet = await openEpisode()
    await fireEvent.click(fold(sheet))
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Gonfiore' }), { target: { value: '0' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Termina adesso' }))
    await waitFor(async () => expect((await db.entries.get(id))?.endedAt).not.toBeNull())
    expect((await updates()).at(-1)?.layers[0].readings).toEqual({ pain: 4, swelling: 0 })
  })
})

describe('A forgotten episode (#115)', () => {
  /** An episode started two days ago at 7, read last at 5 a day and a half ago: nothing since. */
  async function seedStale() {
    const e = await addEntry({ at: ago(48 * 60), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 7 } }] })
    await logUpdate(e.id, [{ pain: 5 }], ago(36 * 60))
    return e.id
  }
  const LAST = () => ago(36 * 60)

  it('asks whether it is still going, says since when nothing was read, and the dropdown line asks too', async () => {
    await seedStale()
    render(App)
    expect(await screen.findByRole('button', { name: /^1 in corso$/ })).toBeInTheDocument()
    const sheet = await openEpisode()
    const card = within(sheet).getByRole('group', { name: 'Ancora in corso?' })
    expect(card).toHaveTextContent('Nessuna lettura da 1g 12h.')
    expect(within(card).getByRole('button', { name: /^Finito all'ultima lettura, ieri 03:00$/ })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Finito adesso' })).toBeInTheDocument()
  })

  it("ends it at the last reading, and undo reopens it", async () => {
    const id = await seedStale()
    render(App)
    const sheet = await openEpisode()
    const card = within(sheet).getByRole('group', { name: 'Ancora in corso?' })
    await fireEvent.click(within(card).getByRole('button', { name: /^Finito all'ultima lettura/ }))
    await waitFor(async () => expect((await db.entries.get(id))?.endedAt).toBe(LAST()))
    // Nothing more was read: ending in the past records no reading.
    expect(await updates()).toHaveLength(1)
    const toast = await screen.findByRole('status')
    expect(toast).toHaveTextContent('Episodio terminato')
    await fireEvent.click(within(toast).getByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect((await db.entries.get(id))?.endedAt).toBeNull())
  })

  it('ends it now, or at a time picked between the last reading and now, refusing one before it', async () => {
    const id = await seedStale()
    render(App)
    let card = within(await openEpisode()).getByRole('group', { name: 'Ancora in corso?' })
    const picker = within(card).getByLabelText('Quando è finito')
    // Two days ago is before the last reading: refused, nothing written.
    await fireEvent.input(picker, { target: { value: toLocal(ago(47 * 60)) } })
    await fireEvent.click(within(card).getByRole('button', { name: 'Termina' }))
    expect(await screen.findByRole('status')).toHaveTextContent("La fine viene dopo l'ultima lettura")
    expect((await db.entries.get(id))?.endedAt).toBeNull()
    await fireEvent.input(picker, { target: { value: toLocal(ago(30 * 60)) } })
    await fireEvent.click(within(card).getByRole('button', { name: 'Termina' }))
    await waitFor(async () => expect((await db.entries.get(id))?.endedAt).toBe(ago(30 * 60)))
    // Reopened, then ended now.
    await db.entries.update(id, { endedAt: null })
    card = within(await openEpisode()).getByRole('group', { name: 'Ancora in corso?' })
    await fireEvent.click(within(card).getByRole('button', { name: 'Finito adesso' }))
    await waitFor(async () => expect((await db.entries.get(id))?.endedAt).toBe(new Date().toISOString()))
  })

  it("refuses a time to come, ignores a cleared picker, and takes the last reading's own minute as the last reading", async () => {
    const e = await addEntry({ at: ago(48 * 60), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 7 } }] })
    // Read at 03:00:30: the picker's 03:00 is that minute.
    const last = new Date(Date.now() - 36 * 3600_000 + 30_000).toISOString()
    await logUpdate(e.id, [{ pain: 5 }], last)
    render(App)
    const card = within(await openEpisode()).getByRole('group', { name: 'Ancora in corso?' })
    const picker = within(card).getByLabelText('Quando è finito')
    await fireEvent.input(picker, { target: { value: toLocal(new Date(Date.now() + 3600_000).toISOString()) } })
    await fireEvent.click(within(card).getByRole('button', { name: 'Termina' }))
    expect(await screen.findByRole('status')).toHaveTextContent('La fine non può essere nel futuro')
    await fireEvent.input(picker, { target: { value: '' } })
    await fireEvent.click(within(card).getByRole('button', { name: 'Termina' }))
    expect((await db.entries.get(e.id))?.endedAt).toBeNull()
    await fireEvent.input(picker, { target: { value: toLocal(last) } })
    await fireEvent.click(within(card).getByRole('button', { name: 'Termina' }))
    await waitFor(async () => expect((await db.entries.get(e.id))?.endedAt).toBe(last))
  })

  it('a fresh episode is not asked', async () => {
    await seedEpisode()
    render(App)
    const sheet = await openEpisode()
    expect(within(sheet).queryByRole('group', { name: 'Ancora in corso?' })).not.toBeInTheDocument()
  })

  it('Aggiorna on a stale episode answers the question: a reading now makes it fresh', async () => {
    await seedStale()
    render(App)
    let sheet = await openEpisode()
    expect(within(sheet).getByRole('group', { name: 'Ancora in corso?' })).toBeInTheDocument()
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '3' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Aggiorna' }))
    await waitFor(async () => expect(await updates()).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    sheet = await openEpisode()
    expect(within(sheet).queryByRole('group', { name: 'Ancora in corso?' })).not.toBeInTheDocument()
  })
})

/** An ISO time as a datetime-local field holds it, in local time to the minute. */
function toLocal(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
