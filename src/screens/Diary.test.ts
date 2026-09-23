import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addEntry, logUpdate, endEpisode, isHead } from '../lib/entries'
import { addPreset, deletePreset, logPreset } from '../lib/presets'
import App from '../App.svelte'
import { mergedReadings, mergedTags } from '../lib/layers'

const L = (regions: string[], pain: number, tags: string[] = []) => ({ regions, readings: { pain }, tags })

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
    // Fixed hours, so the test does not straddle midnight while it runs.
    const at = (daysAgo: number, hour: number) => {
      const d = new Date()
      d.setDate(d.getDate() - daysAgo)
      d.setHours(hour, 0, 0, 0)
      return d.toISOString()
    }
    await addEntry({ at: at(0, 9), layers: [L(['152', '153'], 3)] })
    await addEntry({ at: at(0, 10), layers: [L(['152'], 7)] })
    await addEntry({ at: at(1, 9), layers: [L(['130'], 5)] })
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
    const e = await addEntry({ at: ago(180), kind: 'episode', layers: [L(['152'], 7, ['rest'])], note: 'dopo la corsa' })
    await logUpdate(e.id, [{ pain: 4 }], ago(120))
    await endEpisode(e.id, ago(60))
    await addEntry({ at: ago(30), kind: 'episode', readings: { pain: 2, swelling: 6 } })
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
    await addEntry({ at: ago(10), layers: [L(['152'], 2)] })
    await addEntry({ at: ago(40 * DAY), layers: [L(['152'], 9)] })
    await addEntry({ at: ago(100 * DAY), layers: [L(['152'], 8)] })
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
    const e = await addEntry({ at: ago(60), layers: [L(['152'], 7, ['rest'])], note: 'dopo la corsa' })
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
      expect(cur?.layers).toEqual([L(['152'], 3, ['rest', 'heat'])])
      expect(cur?.note).toBe('meglio')
      expect(mergedTags(cur!.layers)).toEqual(['rest', 'heat'])
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Salvato')).toBeInTheDocument()
    await waitFor(() => expect(rows()[0].querySelector('.pill')).toHaveTextContent('3'))
    expect(rows()[0]).toHaveTextContent('meglio')
  })

  it('deletes with undo', async () => {
    await addEntry({ at: ago(60), layers: [L(['152'], 7)] })
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

  /** An episode row opens its sheet (§5.5); Modifica zone e note is the way to the form. */
  async function openHeadForm() {
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d.*gamba sx/ }))[0])
    const ep = await screen.findByRole('dialog', { name: /Episodio/ })
    await fireEvent.click(within(ep).getByRole('button', { name: 'Modifica zone e note' }))
    return screen.findByRole('dialog', { name: 'Modifica' })
  }

  it('the form ends an episode from the Fine chips, reopens it with In corso, and Cronico makes it a snapshot', async () => {
    const e = await addEntry({ at: ago(60), kind: 'episode', layers: [L(['152'], 7)] })
    await openDiary()
    let sheet = await openHeadForm()
    expect(within(sheet).getByRole('button', { name: 'Episodio' })).toHaveAttribute('aria-pressed', 'true')
    let end = within(sheet).getByRole('group', { name: 'Fine' })
    expect(within(end).getByRole('button', { name: 'In corso' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(within(end).getByRole('button', { name: 'Adesso' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(Date.now() - Date.parse((await db.entries.get(e.id))!.endedAt!)).toBeLessThan(60_000))
    await waitFor(() => expect(rows()[0]).toHaveTextContent('1h'))
    expect(rows()[0]).not.toHaveTextContent('in corso')

    // Reopen: In corso takes the end away.
    sheet = await openHeadForm()
    end = within(sheet).getByRole('group', { name: 'Fine' })
    expect(within(end).getByRole('button', { name: 'Adesso' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(within(end).getByRole('button', { name: 'In corso' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.get(e.id)).toMatchObject({ kind: 'episode', endedAt: null }))
    await waitFor(() => expect(rows()[0]).toHaveTextContent('in corso'))

    // Cronico: a snapshot, no bounds, no Fine row to set, and the row opens the form directly.
    sheet = await openHeadForm()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Cronico' }))
    expect(within(sheet).queryByRole('group', { name: 'Fine' })).not.toBeInTheDocument()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => {
      const cur = await db.entries.get(e.id)
      expect(cur?.kind).toBe('chronic')
      expect(cur).not.toHaveProperty('endedAt')
      expect(cur).not.toHaveProperty('episodeId')
    })
    await waitFor(() => expect(rows()[0]).not.toHaveTextContent('in corso'))
    await fireEvent.click(rows()[0])
    expect(await screen.findByRole('dialog', { name: 'Modifica' })).toBeInTheDocument()
  })

  it('shows when an ended episode ended and lets the end move', async () => {
    const e = await addEntry({ at: ago(300), kind: 'episode', layers: [L(['152'], 7)] })
    await endEpisode(e.id, ago(180))
    await openDiary()
    let sheet = await openHeadForm()
    let end = within(sheet).getByRole('group', { name: 'Fine' })
    expect(within(end).getByRole('button', { name: '3h fa' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(within(end).getByRole('button', { name: '1h fa' }))
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(Date.now() - Date.parse((await db.entries.get(e.id))!.endedAt!)).toBeCloseTo(3600_000, -4))
    await waitFor(() => expect(rows()[0]).toHaveTextContent('4h'))
    // An end off the chips shows as a day and a time.
    await endEpisode(e.id, ago(150))
    sheet = await openHeadForm()
    end = within(sheet).getByRole('group', { name: 'Fine' })
    expect(within(end).getByRole('button', { name: /(Oggi|Ieri) \d\d:\d\d/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('an episode with updates: the row shows the latest reading, the sheet lists every reading to edit, the head keeps its kind, deleting it takes the chain', async () => {
    const e = await addEntry({ at: ago(180), kind: 'episode', layers: [L(['152'], 7)] })
    const u = await logUpdate(e.id, [{ pain: 3 }], ago(60))
    await openDiary()
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0].querySelector('.pill')).toHaveTextContent('3')
    expect(rows()[0]).toHaveTextContent('in corso · 7 → 3')
    await fireEvent.click(rows()[0])
    const ep = await screen.findByRole('dialog', { name: 'Episodio in corso' })
    const points = within(within(ep).getByLabelText('Letture')).getAllByRole('button')
    expect(points.map((b) => b.textContent?.trim())).toEqual([expect.stringMatching(/^\d\d:\d\d 7$/), expect.stringMatching(/^\d\d:\d\d 3$/)])
    // An update is a reading of its episode: no kind, no end, just when.
    await fireEvent.click(points[1])
    let sheet = await screen.findByRole('dialog', { name: 'Modifica' })
    expect(within(sheet).getByRole('slider', { name: 'Dolore' })).toHaveValue('3')
    expect(within(sheet).queryByRole('button', { name: 'Cronico' })).not.toBeInTheDocument()
    expect(within(sheet).queryByRole('group', { name: 'Fine' })).not.toBeInTheDocument()
    expect(within(sheet).getByRole('group', { name: 'Quando' })).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Crea preset da questa voce' })).not.toBeInTheDocument()
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '2' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect((await db.entries.get(u!.id))?.layers[0].readings.pain).toBe(2))
    await waitFor(() => expect(rows()[0]).toHaveTextContent('7 → 2'))
    // The head of a chain stays an episode: no kind chips, the end still moves.
    sheet = await openHeadForm()
    await waitFor(() => expect(within(sheet).queryByRole('button', { name: 'Cronico' })).not.toBeInTheDocument())
    expect(within(sheet).getByRole('group', { name: 'Fine' })).toBeInTheDocument()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Elimina' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(0))
    await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(2))
    expect((await db.entries.toArray()).filter(isHead)).toHaveLength(1)
  })

  it('a row logged from a preset is named after it', async () => {
    const p = await addPreset({ name: 'Schiena', layers: [{ regions: ['224', '225'], asks: ['pain'] }], kind: 'chronic' })
    await logPreset(p, [{ pain: 4 }], ago(30))
    const two = await addPreset({ name: 'Gambe', layers: [{ regions: ['152', '153'], asks: ['pain'] }, { regions: ['150', '151'], asks: ['pain'] }], kind: 'chronic' })
    await logPreset(two, [{ pain: 6 }, { pain: 6 }], ago(20))
    const gone = await addPreset({ name: 'Sparito', layers: [{ regions: ['110'], asks: ['pain'] }], kind: 'chronic' })
    await logPreset(gone, [{ pain: 2 }], ago(10))
    await deletePreset(gone.id)
    await openDiary()
    await waitFor(() => expect(rows()).toHaveLength(3))
    const [orphan, legs, back] = rows()
    await waitFor(() => expect(back).toHaveAccessibleName(/4\s*Schiena/))
    expect(back).not.toHaveTextContent('schiena')
    // A shape holds no tags: nothing is replayed onto the reading.
    expect(back).not.toHaveTextContent('Calore')
    // Several layers keep their levels beside the name.
    expect(legs).toHaveAccessibleName(/6\s*Gambe · gambe 6 · fianchi 6/)
    // A preset that no longer exists leaves the row as any other.
    expect(orphan).toHaveAccessibleName(/2\s*busto/)
  })

  it('closes on Escape without touching the entry', async () => {
    const e = await addEntry({ at: ago(60), layers: [L(['152'], 7)] })
    await openDiary()
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d.*gamba sx/ }))[0])
    const sheet = await screen.findByRole('dialog', { name: 'Modifica' })
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '1' } })
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mergedReadings((await db.entries.get(e.id))!.layers).pain).toBe(7)
  })
})
