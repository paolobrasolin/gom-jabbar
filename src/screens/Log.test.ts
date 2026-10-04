import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { install, initInstall } from '../lib/install.svelte'
import { go, back, presetButton, presetItem, pickPreset, episodesButton, episodeItems, openEpisode, salva, findToast } from '../test/nav'
import App from '../App.svelte'
import { intensityColor } from '../lib/color'
import { LEG_IDS, REGION_BY_ID, shapeOf, shapeCenter, viewBox } from '../lib/regions'
import { addPreset, logPreset } from '../lib/presets'
import { addEntry, isHead, isUpdate } from '../lib/entries'
import { regionLabel } from '../lib/regionLabel'
import { t } from '../i18n/index.svelte'
import { mergedReadings, mergedTags, type Stroke } from '../lib/layers'

let db: ReturnType<typeof resetDb>
/** The episode heads stored, and the latest update of any episode. */
const heads = async () => (await db.entries.toArray()).filter(isHead)
const lastUpdate = async () => (await db.entries.toArray()).filter(isUpdate).sort((a, b) => a.at.localeCompare(b.at)).at(-1)
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
  prefs.mirror = true
  prefs.mirrorViews = false
})
/** The two faces of the slot (#22): Altro shows everything past the fast path, Corpo brings the figure back; a new draft opens on Corpo. */
const more = (scope: { getByRole: typeof screen.getByRole } = screen) => fireEvent.click(scope.getByRole('button', { name: /^Altro/ }))
const body = (scope: { getByRole: typeof screen.getByRole } = screen) => fireEvent.click(scope.getByRole('button', { name: 'Corpo' }))
/** A level's fill as the DOM serialises it. */
function fill(level: number) {
  const probe = document.createElement('div')
  probe.style.background = intensityColor(level)
  return probe.style.background
}
/** The presets' menu, opened. */
const menuOfPresets = async () => (await presetItem('Nuovo preset')).closest<HTMLElement>('[role="menu"]')!
/** The pieces drawn on the stage itself, not on the thumbnail of the other side. */
const strokes = () => document.querySelectorAll('.stage > svg .stroke')

describe('Log layer chips', () => {
  it("a new layer's chip scrolls into sight, off to the right of a full row (#115)", async () => {
    // jsdom has no layout: the row is 200px wide and the pressed chip sits at 500–600 in it, off to the right, moving as it scrolls.
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const row = this.closest<HTMLElement>('.areas')
      const [left, right] = this.classList.contains('areas') ? [0, 200] : row && this.getAttribute('aria-pressed') === 'true' ? [500 - row.scrollLeft, 600 - row.scrollLeft] : [0, 0]
      return { left, right, top: 0, bottom: 0, x: left, y: 0, width: right - left, height: 0, toJSON: () => ({}) } as DOMRect
    })
    try {
      render(App)
      await screen.findByRole('slider', { name: 'Dolore' })
      await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
      await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
      const row = document.querySelector<HTMLElement>('.areas')!
      await waitFor(() => expect(row.scrollLeft).toBe(412))
    } finally {
      rect.mockRestore()
    }
  }, 10_000)
})

describe('Stage rails', () => {
  it('fade where they hide buttons, in the preset form where they scroll (#115)', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await pickPreset('Nuovo preset')
    const form = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    // jsdom has no layout, so nothing overflows: the marks are there, empty, for the fade to follow.
    const rails = form.querySelectorAll('.rail')
    expect(rails).toHaveLength(2)
    for (const r of rails) {
      expect(r).toHaveClass('fade-y')
      expect(r).toHaveAttribute('data-more', '')
    }
  })
})

describe('Log layer without a place', () => {
  it("refuses Salva while a layer holds a level but no place, and shows that layer's figure (#115)", async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '5' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '7' } })
    await salva()
    expect(await findToast()).toHaveTextContent('Dove? Tocca la figura')
    expect(await db.entries.count()).toBe(0)
    // The layer with no place stays current with its level, and a tap gives it a place. (Switching away drops it,
    // the way a layer is deleted, §5.4.)
    expect(document.querySelectorAll<HTMLElement>('.areas .chip')[1]).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia sx' }))
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    // Both layers kept, each with its place and its level.
    expect(e.layers.map((l) => l.readings)).toEqual([{ pain: 5 }, { pain: 7 }])
    expect(e.layers.every((l) => l.regions.length > 0)).toBe(true)
  })
})

describe('Preset sheet and switched-off symptoms', () => {
  it('asks only what is on, and saves a layer whose every ask is off as a place (#115)', async () => {
    await addPreset({ name: 'Gambe', layers: [{ regions: LEG_IDS, asks: ['pain', 'swelling'] }, { regions: ['224'], asks: ['swelling'] }], kind: 'chronic' })
    await db.symptoms.update('swelling', { enabled: false })
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await pickPreset(/^Gambe/)
    const sheet = await screen.findByRole('dialog', { name: 'Gambe' })
    expect(within(sheet).getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['Dolore'])
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '4' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers.map((l) => l.readings)).toEqual([{ pain: 4 }, {}])
  }, 10_000)
})

describe('A forgotten episode in the dropdown (#115)', () => {
  it('its line asks "ancora?" after 24 h without a reading', async () => {
    const day = 86_400_000
    await addEntry({ at: new Date(Date.now() - 2 * day).toISOString(), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 6 }, tags: [] }] })
    await addEntry({ at: new Date(Date.now() - 3600_000).toISOString(), kind: 'episode', layers: [{ regions: ['224'], readings: { pain: 4 }, tags: [] }] })
    render(App)
    const items = await episodeItems()
    expect(items).toHaveLength(2)
    const stale = items.filter((i) => /ancora\?$/.test(i.textContent!.trim()))
    expect(stale).toHaveLength(1)
    expect(stale[0]).toHaveTextContent('da 2g')
    // Set apart from what comes before it, whatever that is.
    expect(stale[0]).toHaveTextContent(/ · ancora\?$/)
  })
})

describe('Deleting a layer (#115)', () => {
  it('a bin before +, while there are two layers or more, drawer open or not, removes the current one, and undo brings it back', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    // One layer: nothing to delete.
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    expect(screen.queryByRole('button', { name: 'Elimina zona' })).not.toBeInTheDocument()
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '5' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Ginocchio sx' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '7' } })
    // In the row of tabs, beside +, with the figure in sight: no need to open the drawer.
    const bin = screen.getByRole('button', { name: 'Elimina zona' })
    expect(bin.closest('.spine')).not.toBeNull()
    expect(bin.nextElementSibling).toHaveAccessibleName('Altra zona')
    await fireEvent.click(bin)
    expect(document.querySelectorAll('.areas .chip')).toHaveLength(1)
    expect(screen.getByRole('slider', { name: /^Dolore/ })).toHaveValue('5')
    const toast = await findToast()
    expect(toast).toHaveTextContent('Zona eliminata')
    await fireEvent.click(within(toast).getByRole('button', { name: 'Annulla' }))
    await waitFor(() => expect(document.querySelectorAll('.areas .chip')).toHaveLength(2))
    expect(screen.getByRole('slider', { name: /^Dolore/ })).toHaveValue('7')
  })

  it('switching away keeps a layer with a level but no place, and Salva then points at it', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '5' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '7' } })
    await fireEvent.click(document.querySelectorAll<HTMLElement>('.areas .chip')[0])
    expect(document.querySelectorAll('.areas .chip')).toHaveLength(2)
    await salva()
    expect(await findToast()).toHaveTextContent('Dove? Tocca la figura')
    expect(document.querySelectorAll<HTMLElement>('.areas .chip')[1]).toHaveAttribute('aria-pressed', 'true')
    expect(await db.entries.count()).toBe(0)
  })
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

describe('Episodes with an end', () => {
  it('an episode already over is logged with its end and goes straight to the diary', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await more()
    expect(screen.queryByRole('group', { name: 'Fine' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Quando' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    const end = screen.getByRole('group', { name: 'Fine' })
    expect(within(end).getByRole('button', { name: 'In corso' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(within(screen.getByRole('group', { name: 'Inizio' })).getByRole('button', { name: '3h fa' }))
    await fireEvent.click(within(end).getByRole('button', { name: '1h fa' }))
    expect(within(end).getByRole('button', { name: '1h fa' })).toHaveAttribute('aria-pressed', 'true')
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e).toMatchObject({ kind: 'episode', episodeId: e.id })
    expect(Date.parse(e.endedAt!) - Date.parse(e.at)).toBeCloseTo(2 * 3600_000, -4)
    expect(episodesButton()).toBeNull()
    // The next draft starts over: Cronico, whatever the last save was, so a quick log is never an episode by accident.
    await more()
    expect(screen.getByRole('button', { name: 'Cronico' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: 'Fine' })).not.toBeInTheDocument()
    await body()
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(2))
    expect((await db.entries.orderBy('createdAt').last())?.kind).toBe('chronic')
  })

  it('Inizio and Fine both "Adesso" save however long Salva waits: the start is not after an end set by "Adesso"', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 8, 30, 15, 0, 50))
      render(App)
      await more()
      await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
      await fireEvent.click(within(screen.getByRole('group', { name: 'Fine' })).getByRole('button', { name: 'Adesso' }))
      // A minute turns while the note is written.
      vi.setSystemTime(new Date(2026, 8, 30, 15, 3, 10))
      await salva()
      await waitFor(async () => expect(await db.entries.count()).toBe(1))
      const [e] = await db.entries.toArray()
      expect(e.endedAt).toBe(new Date(2026, 8, 30, 15, 0, 50).toISOString())
      expect(e.at).toBe(e.endedAt)
    } finally {
      vi.useRealTimers()
    }
  })

  it("a save's toast still showing when the drawer opens moves to the top, off the kind switch", async () => {
    render(App)
    await fireEvent.click(await screen.findByRole('button', { name: 'Coscia dx' }))
    await salva()
    const toast = (await screen.findByText('Salvato')).closest('.toast')!
    expect(toast).not.toHaveClass('top')
    await more()
    await waitFor(() => expect(screen.getByText('Salvato').closest('.toast')).toHaveClass('top'))
  })

  it('the refusal of an end before the start shows at the top, clear of the time rows the open drawer shows', async () => {
    render(App)
    // With the drawer down, a toast sits above it.
    await fireEvent.click(await screen.findByRole('button', { name: 'Coscia dx' }))
    await salva()
    expect((await screen.findByText('Salvato')).closest('.toast')).not.toHaveClass('top')
    await new Promise((r) => setTimeout(r, 1100))
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    await fireEvent.click(within(screen.getByRole('group', { name: 'Fine' })).getByRole('button', { name: '1h fa' }))
    await salva()
    const toast = (await screen.findByText("La fine è prima dell'inizio")).closest('.toast')!
    expect(toast).toHaveClass('top')
  })

  it('Inizio "Adesso" with an end picked in the past is still refused', async () => {
    render(App)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    await fireEvent.click(within(screen.getByRole('group', { name: 'Fine' })).getByRole('button', { name: '1h fa' }))
    await salva()
    expect(await screen.findByText('La fine è prima dell\'inizio')).toBeInTheDocument()
    expect(await db.entries.count()).toBe(0)
  })

  it('a picker cleared on the phone changes nothing: the time stays as it was', async () => {
    render(App)
    await more()
    const start = screen.getByRole('group', { name: 'Quando' })
    await fireEvent.click(within(start).getByRole('button', { name: '3h fa' }))
    await fireEvent.click(within(start).getByRole('button', { name: 'Scegli…' }))
    await fireEvent.change(document.querySelector('input[type="datetime-local"]')!, { target: { value: '' } })
    expect(within(start).getByRole('button', { name: '3h fa' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Adesso as an end is the moment it was pressed, and the picker sets any end', async () => {
    render(App)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    const end = screen.getByRole('group', { name: 'Fine' })
    await fireEvent.click(within(end).getByRole('button', { name: 'Adesso' }))
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    let [e] = await db.entries.toArray()
    expect(Date.now() - Date.parse(e.endedAt!)).toBeLessThan(5000)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    // An end needs a start before it: both picked on the same day.
    await fireEvent.click(within(screen.getByRole('group', { name: 'Inizio' })).getByRole('button', { name: 'Scegli…' }))
    await fireEvent.change(document.querySelector('input[type="datetime-local"]')!, { target: { value: '2026-09-01T10:00' } })
    await fireEvent.click(within(screen.getByRole('group', { name: 'Fine' })).getByRole('button', { name: 'Scegli…' }))
    const pickers = document.querySelectorAll('input[type="datetime-local"]')
    expect(pickers).toHaveLength(1)
    await fireEvent.change(pickers[0], { target: { value: '2026-09-01T12:30' } })
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(2))
    e = (await db.entries.orderBy('createdAt').last())!
    expect(new Date(e.endedAt!).getHours()).toBe(12)
    expect(new Date(e.endedAt!).getMinutes()).toBe(30)
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

describe('Presets', () => {
  it('the Preset dropdown offers a new preset before any exists; the form is its shape, the chips say what it asks, the form stays as it was', async () => {
    render(App)
    // Before any preset, the dropdown holds only the way to make one.
    expect(presetButton()).toHaveAccessibleName('Preset')
    expect(within(await menuOfPresets()).getAllByRole('menuitem')).toHaveLength(1)
    await fireEvent.keyDown(await menuOfPresets(), { key: 'Escape' })
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await more()
    await fireEvent.input(await screen.findByRole('slider', { name: 'Gonfiore' }), { target: { value: '3' } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Impacco caldo' }))
    await pickPreset('Nuovo preset')
    const form = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    // Prefilled from the log form: the legs, pain and swelling asked, no time, tags, sliders or note.
    expect(within(form).getByRole('button', { name: 'Gambe' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(form).getByRole('button', { name: 'Cronico' })).toHaveAttribute('aria-pressed', 'true')
    const asks = within(form).getByRole('group', { name: 'Chiede' })
    expect(await within(asks).findByRole('button', { name: 'Dolore' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(asks).getByRole('button', { name: 'Gonfiore' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(asks).getByRole('button', { name: 'Rigidità' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(asks).queryByRole('button', { name: 'Ansia' })).not.toBeInTheDocument()
    expect(within(form).queryByRole('button', { name: 'Adesso' })).not.toBeInTheDocument()
    expect(within(form).queryByRole('button', { name: 'Impacco caldo' })).not.toBeInTheDocument()
    expect(within(form).queryByRole('slider')).not.toBeInTheDocument()
    expect(within(form).queryByRole('textbox', { name: 'Note' })).not.toBeInTheDocument()
    // Membership is explicit: a symptom at 0 today can still be asked, one above 0 can be left out.
    await fireEvent.click(within(asks).getByRole('button', { name: 'Rigidità' }))
    await fireEvent.click(within(asks).getByRole('button', { name: 'Gonfiore' }))
    const create = within(form).getByRole('button', { name: 'Crea preset' })
    // Without a name the button stays readable and says what is missing by putting the cursor in the name (#23).
    const name = within(form).getByRole('textbox', { name: 'Nome del preset' })
    expect(create).toBeEnabled()
    await fireEvent.click(create)
    expect(name).toHaveFocus()
    expect(await db.presets.count()).toBe(0)
    await fireEvent.input(name, { target: { value: 'Le gambe' } })
    await fireEvent.click(create)
    expect(await screen.findByText('Preset creato')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuovo preset' })).not.toBeInTheDocument())
    expect(await db.presets.count()).toBe(1)
    const [p] = await db.presets.toArray()
    expect(p).toMatchObject({ name: 'Le gambe', kind: 'chronic' })
    expect(p.layers).toEqual([{ regions: [...LEG_IDS].sort(), asks: ['pain', 'stiffness'] }])
    // The form is untouched and carries nothing: the preset is made, the log form stays a plain entry (§5.6).
    expect(presetButton()).toHaveAccessibleName('Preset')
    expect(presetButton()).not.toHaveClass('linked')
    const made = await presetItem(/Le gambe/)
    expect(made).toHaveTextContent('mai')
    expect(made).not.toHaveAttribute('aria-current')
    // The + of Nuovo preset is drawn, not typed, so it sits in the middle of its circle.
    expect((await presetItem('Nuovo preset')).querySelector('svg')).not.toBeNull()
    await fireEvent.keyDown(await menuOfPresets(), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Impacco caldo' })).toHaveAttribute('aria-pressed', 'true')
    await body()
    expect(screen.getByRole('button', { name: 'Gambe' })).toHaveAttribute('aria-pressed', 'true')
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e).not.toHaveProperty('presetId')
    expect(e.layers).toEqual([{ regions: [...LEG_IDS].sort(), readings: { pain: 5, swelling: 3 }, tags: ['heat'] }])
    // A reading under the preset comes from its own sheet.
    await pickPreset(/Le gambe/)
    const sheet = await screen.findByRole('dialog', { name: 'Le gambe' })
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '4' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await presetItem(/Le gambe/)).toHaveTextContent(/^4\s*Le gambe · 0m$/))
  })

  it('zones changed in the preset form stay in the preset: the log form keeps its own, and its Salva files nothing under the new name', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await pickPreset('Nuovo preset')
    const form = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    await within(within(form).getByRole('group', { name: 'Chiede' })).findByRole('button', { name: 'Dolore' })
    // In the preset form: the legs out, the arms in.
    await fireEvent.click(within(form).getByRole('button', { name: 'Gambe' }))
    await fireEvent.click(within(form).getByRole('button', { name: 'Braccia' }))
    await fireEvent.input(within(form).getByRole('textbox', { name: 'Nome del preset' }), { target: { value: 'Braccia' } })
    await fireEvent.click(within(form).getByRole('button', { name: 'Crea preset' }))
    await waitFor(async () => expect(await db.presets.count()).toBe(1))
    const [p] = await db.presets.toArray()
    expect(p.layers[0].regions).not.toContain(LEG_IDS[0])
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuovo preset' })).not.toBeInTheDocument())
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e).not.toHaveProperty('presetId')
    expect(e.layers[0].regions).toEqual([...LEG_IDS].sort())
  })

  it('a preset whose last sample read nothing shows no level in the dropdown, not a 0 (#114)', async () => {
    const p = await addPreset({ name: 'Solo dove', layers: [{ regions: ['152'], asks: [] }], kind: 'chronic' })
    await logPreset(p, [{}])
    render(App)
    const item = await presetItem(/Solo dove/)
    await waitFor(() => expect(item).not.toHaveTextContent('mai'))
    expect(item.querySelector('.dot')).toHaveTextContent('–')
  })

  it('undo on the created preset removes it; the form never carried it', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await pickPreset('Nuovo preset')
    const form = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    await within(within(form).getByRole('group', { name: 'Chiede' })).findByRole('button', { name: 'Dolore' })
    await fireEvent.input(within(form).getByRole('textbox', { name: 'Nome del preset' }), { target: { value: 'Le gambe' } })
    await fireEvent.keyDown(within(form).getByRole('textbox', { name: 'Nome del preset' }), { key: 'Enter' })
    await waitFor(async () => expect(await db.presets.count()).toBe(1))
    await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.presets.count()).toBe(0))
    expect(within(await menuOfPresets()).getAllByRole('menuitem')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Gambe' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('an empty form gives an empty shape: no location, pain asked; the time chip is not part of it', async () => {
    await addEntry({ at: '2026-09-02T10:00:00.000Z', layers: [{ regions: LEG_IDS, readings: { pain: 4, swelling: 2 }, tags: ['heat'] }], note: 'x' })
    render(App)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: '1h fa' }))
    await pickPreset('Nuovo preset')
    const form = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    expect(within(form).getByText('Nessuna zona: tocca la figura')).toBeInTheDocument()
    expect(within(form).getByRole('button', { name: 'Gambe' })).toHaveAttribute('aria-pressed', 'false')
    const asks = within(form).getByRole('group', { name: 'Chiede' })
    expect(await within(asks).findByRole('button', { name: 'Dolore' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(asks).getByRole('button', { name: 'Gonfiore' })).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.input(within(form).getByRole('textbox', { name: 'Nome del preset' }), { target: { value: 'Vago' } })
    await fireEvent.click(within(form).getByRole('button', { name: 'Crea preset' }))
    await waitFor(async () => expect(await db.presets.count()).toBe(1))
    const [p] = await db.presets.toArray()
    expect(p).toMatchObject({ name: 'Vago', kind: 'chronic', layers: [{ regions: [], asks: ['pain'] }] })
    expect(screen.getByRole('button', { name: '1h fa' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('creates a preset from a saved entry in the diary; the edit sheet stays open and is not saved', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    await go('Diario')
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
    const edit = await screen.findByRole('dialog', { name: 'Modifica' })
    await fireEvent.click(within(edit).getByRole('button', { name: 'Spalla sx' }))
    await more(within(edit))
    await fireEvent.click(within(edit).getByRole('button', { name: 'Crea preset da questa voce' }))
    const form = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    expect(within(form).getByRole('button', { name: 'Gambe' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(form).getByRole('button', { name: 'Spalla sx' })).toHaveAttribute('aria-pressed', 'true')
    // Escape closes the top sheet only.
    await fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuovo preset' })).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Modifica' })).toBeInTheDocument()
    await fireEvent.click(within(edit).getByRole('button', { name: 'Crea preset da questa voce' }))
    const again = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    await fireEvent.input(within(again).getByRole('textbox', { name: 'Nome del preset' }), { target: { value: 'Le gambe' } })
    await fireEvent.click(within(again).getByRole('button', { name: 'Crea preset' }))
    expect(await screen.findByText('Preset creato')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Modifica' })).toBeInTheDocument()
    await waitFor(async () => expect(await db.presets.count()).toBe(1))
    const [p] = await db.presets.toArray()
    expect(p.layers).toEqual([{ regions: [...LEG_IDS, '130', '131'].sort(), asks: ['pain'] }])
    // The entry itself was not saved with the shoulder.
    const [e] = await db.entries.toArray()
    expect(e.layers[0].regions).toEqual([...LEG_IDS].sort())
    await fireEvent.keyDown(window, { key: 'Escape' })
    // The closed sheet gives its history step back after the current task; a back in the same task would spend it.
    await waitFor(() => expect(history.state?.sheet).toBeUndefined())
    await back()
    expect(presetButton()).toHaveAccessibleName('Preset')
    const chip = await presetItem(/Le gambe/)
    expect(chip).toHaveTextContent('mai')
    await fireEvent.click(chip)
    const ps = await screen.findByRole('dialog', { name: 'Le gambe' })
    await fireEvent.input(within(ps).getByRole('slider', { name: 'Dolore' }), { target: { value: '6' } })
    await fireEvent.click(within(ps).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => {
      expect(await db.entries.count()).toBe(2)
      const logged = (await db.entries.toArray()).find((x) => x.presetId)!
      expect(logged.presetId).toBe(p.id)
      expect(logged.layers).toEqual([{ regions: [...LEG_IDS, '130', '131'].sort(), readings: { pain: 6 }, tags: [] }])
    })
    await waitFor(async () => expect(await presetItem(/Le gambe/)).toHaveTextContent(/^6\s*Le gambe · 0m$/))
  })

  it("an episode preset's sheet says it starts one: Inizio over the time, Inizia episodio on the button (#115)", async () => {
    await addPreset({ name: 'Emicrania', layers: [{ regions: ['100'], asks: ['pain'] }], kind: 'episode' })
    await addPreset({ name: 'Schiena', layers: [{ regions: ['224'], asks: ['pain'] }], kind: 'chronic' })
    render(App)
    await pickPreset(/Emicrania/)
    const ep = await screen.findByRole('dialog', { name: 'Emicrania' })
    expect(within(ep).getByRole('group', { name: 'Inizio' })).toBeInTheDocument()
    // Captioned on screen too, as the log's time rows are.
    expect(within(ep).getByText('Inizio')).toBeVisible()
    await fireEvent.input(within(ep).getByRole('slider', { name: 'Dolore' }), { target: { value: '6' } })
    await fireEvent.click(within(ep).getByRole('button', { name: 'Inizia episodio' }))
    await waitFor(async () => expect((await db.entries.toArray()).filter((e) => e.kind === 'episode')).toHaveLength(1))
    // A chronic preset's sheet stays as it was.
    await pickPreset(/Schiena/)
    const ch = await screen.findByRole('dialog', { name: 'Schiena' })
    expect(within(ch).getByRole('group', { name: 'Quando' })).toBeInTheDocument()
    expect(within(ch).getByText('Quando')).toBeVisible()
    expect(within(ch).getByRole('button', { name: 'Salva' })).toBeInTheDocument()
  })

  it('logs a preset at a chosen time: the sheet has the time chips', async () => {
    const p = await addPreset({ name: 'Schiena', layers: [{ regions: ['224'], asks: ['pain'] }], kind: 'chronic' })
    render(App)
    await pickPreset(/Schiena/)
    const ps = await screen.findByRole('dialog', { name: 'Schiena' })
    expect(within(ps).getByRole('button', { name: 'Adesso' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(within(ps).getByRole('button', { name: 'Ieri sera' }))
    await fireEvent.input(within(ps).getByRole('slider', { name: 'Dolore' }), { target: { value: '4' } })
    await fireEvent.click(within(ps).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.presetId).toBe(p.id)
    const d = new Date(e.at)
    expect(d.getHours()).toBe(22)
    expect(d.getDate()).toBe(new Date(Date.now() - 86_400_000).getDate())
    // The chip says how long ago the last sample was, so a backdated one reads as such.
    await waitFor(async () => expect(await presetItem(/Schiena/)).toHaveTextContent(/· (\d+h|\d+g( \d+h)?)$/))
    // The next opening starts from now again.
    await pickPreset(/Schiena/)
    const again = await screen.findByRole('dialog', { name: 'Schiena' })
    expect(within(again).getByRole('button', { name: 'Adesso' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('the preset sheet starts every slider at 0, whatever was logged before', async () => {
    const p = await addPreset({ name: 'Schiena', layers: [{ regions: ['224'], asks: ['pain', 'swelling'] }], kind: 'chronic' })
    const { logPreset } = await import('../lib/presets')
    await logPreset(p, [{ pain: 3, swelling: 7 }])
    render(App)
    await pickPreset(/Schiena/)
    const ps = await screen.findByRole('dialog', { name: 'Schiena' })
    expect(within(ps).getByRole('slider', { name: 'Dolore' })).toHaveValue('0')
    expect(within(ps).getByRole('slider', { name: 'Gonfiore' })).toHaveValue('0')
  })

  it('a preset asking nothing at all is a one-tap "nothing to report": its sheet has no sliders and records no reading', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await pickPreset('Nuovo preset')
    const form = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    const asks = within(form).getByRole('group', { name: 'Chiede' })
    await fireEvent.click(await within(asks).findByRole('button', { name: 'Dolore' }))
    await fireEvent.input(within(form).getByRole('textbox', { name: 'Nome del preset' }), { target: { value: 'Gambe ok' } })
    expect(within(form).getByRole('button', { name: 'Crea preset' })).toBeEnabled()
    await fireEvent.click(within(form).getByRole('button', { name: 'Crea preset' }))
    await waitFor(async () => expect(await db.presets.count()).toBe(1))
    expect((await db.presets.toArray())[0].layers).toEqual([{ regions: [...LEG_IDS].sort(), asks: [] }])
    await pickPreset(/Gambe ok/)
    const ps = await screen.findByRole('dialog', { name: 'Gambe ok' })
    expect(within(ps).queryByRole('slider')).not.toBeInTheDocument()
    await fireEvent.click(within(ps).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect((await db.entries.toArray())[0].layers).toEqual([{ regions: [...LEG_IDS].sort(), readings: {}, tags: [] }])
  })

  it('a layer asking nothing is kept: Crea stays enabled, the sheet shows it no sliders', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Mente' }))
    await pickPreset('Nuovo preset')
    const form = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    // Chiede follows the layer: the mind layer, current, offers the mind symptoms and asks nothing yet.
    const asks = within(form).getByRole('group', { name: 'Chiede' })
    expect(await within(asks).findByRole('button', { name: 'Nebbia mentale' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(asks).queryByRole('button', { name: 'Dolore' })).not.toBeInTheDocument()
    await fireEvent.click(form.querySelectorAll<HTMLButtonElement>('.chips.areas .area')[0])
    expect(within(asks).getByRole('button', { name: 'Dolore' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.input(within(form).getByRole('textbox', { name: 'Nome del preset' }), { target: { value: 'Gambe e testa' } })
    await fireEvent.click(within(form).getByRole('button', { name: 'Crea preset' }))
    await waitFor(async () => expect(await db.presets.count()).toBe(1))
    const [p] = await db.presets.toArray()
    expect(p.layers).toEqual([{ regions: [...LEG_IDS].sort(), asks: ['pain'] }, { regions: ['mind'], asks: [] }])
    // Logging from the preset's own sheet.
    await pickPreset(/Gambe e testa/)
    const ps = await screen.findByRole('dialog', { name: 'Gambe e testa' })
    const chips = ps.querySelectorAll<HTMLButtonElement>('.chips.layers .area')
    expect(chips).toHaveLength(2)
    await fireEvent.input(within(ps).getByRole('slider', { name: 'Dolore' }), { target: { value: '2' } })
    await fireEvent.click(chips[1])
    expect(within(ps).queryByRole('slider')).not.toBeInTheDocument()
    await fireEvent.click(within(ps).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect((await db.entries.toArray())[0].layers).toEqual([{ regions: [...LEG_IDS].sort(), readings: { pain: 2 }, tags: [] }, { regions: ['mind'], readings: {}, tags: [] }])
    // The log form, linked to nothing, stays as it was.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Azzera' })).toBeEnabled()
    expect(presetButton()).toHaveAccessibleName('Preset')
  })

  it('a preset with several layers: the sheet asks each layer its own sliders and saves each its own levels', async () => {
    const p = await addPreset({ name: 'Gambe e spalla', layers: [{ regions: LEG_IDS, asks: ['pain', 'swelling'] }, { regions: ['130', '131'], asks: ['pain'] }], kind: 'chronic' })
    render(App)
    await pickPreset(/Gambe e spalla/)
    const ps = await screen.findByRole('dialog', { name: 'Gambe e spalla' })
    const chips = () => ps.querySelectorAll<HTMLButtonElement>('.chips.layers .area')
    await waitFor(() => expect(chips()).toHaveLength(2))
    expect(chips()[0]).toHaveAttribute('aria-pressed', 'true')
    expect(within(ps).getByRole('slider', { name: 'Dolore' })).toHaveValue('0')
    await fireEvent.input(within(ps).getByRole('slider', { name: 'Dolore' }), { target: { value: '5' } })
    await fireEvent.input(within(ps).getByRole('slider', { name: 'Gonfiore' }), { target: { value: '6' } })
    await fireEvent.click(chips()[1])
    expect(chips()[1]).toHaveAttribute('aria-pressed', 'true')
    expect(within(ps).queryByRole('slider', { name: 'Gonfiore' })).not.toBeInTheDocument()
    await fireEvent.input(within(ps).getByRole('slider', { name: 'Dolore' }), { target: { value: '2' } })
    await fireEvent.click(within(ps).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.presetId).toBe(p.id)
    expect(e.layers).toEqual([
      { regions: [...LEG_IDS].sort(), readings: { pain: 5, swelling: 6 }, tags: [] },
      { regions: ['130', '131'], readings: { pain: 2 }, tags: [] },
    ])
    // The next opening starts from 0 again.
    await pickPreset(/Gambe e spalla/)
    const again = await screen.findByRole('dialog', { name: 'Gambe e spalla' })
    expect(within(again).getByRole('slider', { name: 'Gonfiore' })).toHaveValue('0')
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

describe('The stage', () => {
  /** Client coordinates of a figure point on the stage (jsdom rects sit at 0,0). */
  function at(svg: Element, x: number, y: number) {
    const k = Number(svg.getAttribute('data-k'))
    return { clientX: Number(svg.getAttribute('data-tx')) + k * x, clientY: Number(svg.getAttribute('data-ty')) + k * y }
  }
  const centre = (id: string) => shapeCenter(shapeOf(prefs.figure, REGION_BY_ID[id]))
  const finger = (id: number, xy: { clientX: number; clientY: number }) => ({ ...xy, pointerId: id, button: 0, buttons: 1, isPrimary: id === 1 })
  async function drag(svg: Element, from: { clientX: number; clientY: number }, to: { clientX: number; clientY: number }) {
    await fireEvent.pointerDown(svg, finger(1, from))
    await fireEvent.pointerMove(svg, finger(1, to))
    await fireEvent.pointerUp(svg, finger(1, to))
  }
  async function paint(svg: Element, from: [number, number], to: [number, number]) {
    await fireEvent.pointerDown(svg, finger(1, at(svg, ...from)))
    const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.3]
    await fireEvent.pointerMove(svg, finger(1, at(svg, ...mid)))
    await fireEvent.pointerMove(svg, finger(1, at(svg, ...to)))
    await fireEvent.pointerUp(svg, finger(1, at(svg, ...to)))
  }
  const buttock = () => regionLabel('227', t)

  it('one figure fills the stage, fitted whole; a sideways swipe or the chips turn it, a short or steep drag does not', async () => {
    render(App)
    const front = screen.getByRole('group', { name: 'Davanti' })
    expect(screen.queryByRole('group', { name: 'Dietro' })).not.toBeInTheDocument()
    // Fitted: the view's own content box, clear of the rails, its middle in the middle of the stage (300×320 under jsdom).
    const vb = viewBox(prefs.figure, 'front')
    const k = Number(front.getAttribute('data-k'))
    expect(k).toBeCloseTo(Math.min((300 - 152) / vb.w, (320 - 16) / vb.h), 5)
    expect(Number(front.getAttribute('data-ty')) + k * (vb.y + vb.h / 2)).toBeCloseTo(160, 5)
    expect(Number(front.getAttribute('data-tx')) + k * (vb.x + vb.w / 2)).toBeCloseTo(150, 5)
    // The front's segments are there to tap, the back's are not; the mind is in the corner of either view; the other side is a thumbnail.
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: buttock() })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dietro' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Davanti' })).not.toBeInTheDocument()
    // The rails hold the helpers; the zoom is there in either mode, Adatta and Riduci idle until zoomed, and a new draft fits again.
    expect(screen.getByRole('button', { name: 'Entrambi i lati' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Adatta' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Riduci' })).toBeDisabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci' }))
    expect(Number(front.getAttribute('data-k'))).toBeCloseTo(k * 1.5, 5)
    expect(screen.getByRole('button', { name: 'Adatta' })).toBeEnabled()
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect(Number(screen.getByRole('group', { name: 'Davanti' }).getAttribute('data-k'))).toBeCloseTo(k, 5)
    // A swipe across the skin turns it; the click a mouse fires afterwards, on whatever segment is now under it, is swallowed.
    const thigh = screen.getByRole('button', { name: 'Coscia dx' })
    await fireEvent.pointerDown(thigh, finger(1, { clientX: 200, clientY: 150 }))
    await fireEvent.pointerMove(thigh, finger(1, { clientX: 100, clientY: 160 }))
    await fireEvent.pointerUp(thigh, finger(1, { clientX: 100, clientY: 160 }))
    const back = screen.getByRole('group', { name: 'Dietro' })
    expect(screen.queryByRole('group', { name: 'Davanti' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Davanti' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mente' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: buttock() }))
    expect(screen.getByRole('button', { name: buttock() })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Nessuna zona: tocca la figura')).toBeInTheDocument()
    // The next click lands.
    await fireEvent.click(screen.getByRole('button', { name: buttock() }))
    expect(screen.getByRole('button', { name: buttock() })).toHaveAttribute('aria-pressed', 'true')
    // Too short, or too steep: a tap, nothing turns; the next click on a segment lands.
    await drag(back, { clientX: 100, clientY: 100 }, { clientX: 130, clientY: 100 })
    await drag(back, { clientX: 100, clientY: 100 }, { clientX: 200, clientY: 200 })
    expect(screen.getByRole('group', { name: 'Dietro' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: buttock() }))
    expect(screen.getByRole('button', { name: buttock() })).toHaveAttribute('aria-pressed', 'false')
    // The back is fitted on its own box, which sits off the front's.
    const bb = viewBox(prefs.figure, 'back')
    const kb = Number(back.getAttribute('data-k'))
    expect(kb).toBeCloseTo(Math.min((300 - 152) / bb.w, (320 - 16) / bb.h), 5)
    expect(Number(back.getAttribute('data-tx')) + kb * (bb.x + bb.w / 2)).toBeCloseTo(150, 5)
    // Back the other way: the thumbnail.
    await fireEvent.click(screen.getByRole('button', { name: 'Davanti' }))
    expect(screen.getByRole('group', { name: 'Davanti' })).toBeInTheDocument()
    await drag(screen.getByRole('group', { name: 'Davanti' }), { clientX: 100, clientY: 100 }, { clientX: 250, clientY: 110 })
    expect(screen.getByRole('group', { name: 'Dietro' })).toBeInTheDocument()
  })

  it('a tap just off the skin lands on the nearest segment; one far out does nothing', async () => {
    render(App)
    const front = screen.getByRole('group', { name: 'Davanti' })
    const hand = shapeOf(prefs.figure, REGION_BY_ID['145'])
    const [lx, ly] = hand.points.reduce((a, p) => (p[0] < a[0] ? p : a))
    const tap = async (x: number, y: number) => {
      const p = at(front, x, y)
      await fireEvent.pointerDown(front, finger(1, p))
      await fireEvent.pointerUp(front, finger(1, p))
      await fireEvent.click(front, p)
    }
    await tap(lx - 3, ly)
    // Mirror is on: both hands.
    expect(screen.getByRole('button', { name: regionLabel('145', t) })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: regionLabel('144', t) })).toHaveAttribute('aria-pressed', 'true')
    await tap(lx - 40, ly)
    expect(screen.getByRole('button', { name: regionLabel('145', t) })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Davanti e dietro takes the other view along on a tap, not the trunk, and the thumbnail shows it', async () => {
    render(App)
    expect(screen.getByRole('button', { name: 'Davanti e dietro' })).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(screen.getByRole('button', { name: 'Davanti e dietro' }))
    expect(prefs.mirrorViews).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.click(screen.getByRole('button', { name: regionLabel('110', t) }))
    await fireEvent.click(screen.getByRole('button', { name: 'Dietro' }))
    expect(screen.getByRole('button', { name: regionLabel('252', t) })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: regionLabel('253', t) })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: regionLabel('220', t) })).toHaveAttribute('aria-pressed', 'false')
    // Off again: a tap behind stays behind.
    await fireEvent.click(screen.getByRole('button', { name: 'Davanti e dietro' }))
    await fireEvent.click(screen.getByRole('button', { name: regionLabel('252', t) }))
    expect(screen.getByRole('button', { name: regionLabel('252', t) })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: regionLabel('253', t) })).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(screen.getByRole('button', { name: 'Davanti' }))
    // Mirror is on: both thighs in front stay, untouched by the tap behind.
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Coscia sx' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('the kind is one switch with two halves, on its own row above a time row that keeps its caption', async () => {
    render(App)
    await more()
    const sw = screen.getByRole('group', { name: 'Tipo' })
    expect(within(sw).getByRole('button', { name: 'Cronico' })).toHaveAttribute('aria-pressed', 'true')
    const when = screen.getByRole('group', { name: 'Quando' })
    expect(when).toHaveTextContent(/^Quando/)
    expect(within(when).queryByRole('button', { name: 'Cronico' })).not.toBeInTheDocument()
    await fireEvent.click(within(sw).getByRole('button', { name: 'Episodio' }))
    expect(screen.getByRole('group', { name: 'Inizio' })).toHaveTextContent(/^Inizio/)
    expect(screen.getByRole('group', { name: 'Fine' })).toHaveTextContent(/^Fine/)
    expect(screen.queryByRole('group', { name: 'Quando' })).not.toBeInTheDocument()
  })

  it('the rail has head and torso, and one button per limb side when 2 lati is off', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Testa' }))
    expect(screen.getByRole('button', { name: 'Testa' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: regionLabel('100', t) })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Testa' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Tronco' }))
    expect(screen.getByRole('button', { name: regionLabel('110', t) })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Tronco' }))
    expect(screen.queryByRole('button', { name: 'Gamba sx' })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Entrambi i lati' }))
    expect(screen.queryByRole('button', { name: 'Gambe' })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Gamba sx' }))
    expect(screen.getByRole('button', { name: 'Gamba sx' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Gamba dx' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Coscia sx' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/gamba sx/)).toBeInTheDocument()
    prefs.mirror = true
  })

  it('the handle says the time once one is set, or the end, or a picked moment', async () => {
    render(App)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: '1h fa' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Corpo' }))
    expect(screen.getByRole('button', { name: 'Altro · 1h fa' })).toBeInTheDocument()
    // The handle shows only its chevron (#115): the time is written on Salva, the button that records it.
    expect(screen.getByRole('button', { name: 'Altro · 1h fa' })).toHaveTextContent(/^\s*$/)
    expect(screen.getByRole('button', { name: 'Salva' })).toHaveTextContent('Salva · 1h fa')
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Adesso' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Corpo' }))
    expect(screen.getByRole('button', { name: 'Altro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salva' })).toHaveTextContent(/^Salva$/)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    await fireEvent.click(within(screen.getByRole('group', { name: 'Fine' })).getByRole('button', { name: '3h fa' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Corpo' }))
    expect(screen.getByRole('button', { name: 'Altro · Fine 3h fa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salva' })).toHaveTextContent('Salva · Fine 3h fa')
    await more()
    await fireEvent.click(within(screen.getByRole('group', { name: 'Inizio' })).getByRole('button', { name: 'Scegli…' }))
    await fireEvent.change(document.querySelector('input[type="datetime-local"]')!, { target: { value: '2026-09-01T12:30' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Corpo' }))
    expect(screen.getByRole('button', { name: /^Altro · .*12:30$/ })).toBeInTheDocument()
  })

  it('the handle slides with a vertical drag, and a tap after a drag does not toggle it back', async () => {
    render(App)
    const handle = () => screen.getByRole('button', { name: /^(Altro|Corpo)/ })
    await fireEvent.pointerDown(handle(), { clientY: 300 })
    await fireEvent.pointerMove(handle(), { clientY: 290 })
    expect(handle()).toHaveAttribute('aria-expanded', 'false')
    await fireEvent.pointerMove(handle(), { clientY: 250 })
    await fireEvent.pointerUp(handle())
    await fireEvent.click(handle())
    expect(handle()).toHaveAttribute('aria-expanded', 'true')
    await fireEvent.pointerDown(handle(), { clientY: 100 })
    await fireEvent.pointerMove(handle(), { clientY: 160 })
    await fireEvent.pointerCancel(handle())
    await fireEvent.click(handle())
    expect(handle()).toHaveAttribute('aria-expanded', 'false')
    // A move without a press does nothing; a plain tap toggles.
    await fireEvent.pointerMove(handle(), { clientY: 0 })
    await fireEvent.click(handle())
    expect(handle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens on the view holding most of the entry being edited', async () => {
    await addEntry({ layers: [{ regions: ['226', '227', '152'], readings: { pain: 6 }, tags: [] }] })
    render(App)
    await go('Diario')
    await fireEvent.click(await screen.findByText('glutei, coscia sx'))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('group', { name: 'Dietro' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: buttock() })).toHaveAttribute('aria-pressed', 'true')
  })

  it('while painting, a swipe from the air turns the figure and one on the skin paints, however flat', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('group', { name: 'Davanti' })
    // No segments to tap while painting, and the mind steps aside; the helpers stay.
    expect(screen.queryByRole('button', { name: 'Coscia dx' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mente' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gambe' })).toBeInTheDocument()
    // The brush's tools appear beside it; the zoom stays.
    expect(screen.getByRole('button', { name: 'Annulla tratto' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancella disegno' })).toBeDisabled()
    const k0 = Number(front.getAttribute('data-k'))
    await fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci' }))
    expect(Number(front.getAttribute('data-k'))).toBeCloseTo(k0 * 1.5, 5)
    await fireEvent.click(screen.getByRole('button', { name: 'Riduci' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Riduci' }))
    expect(Number(front.getAttribute('data-k'))).toBeCloseTo(k0, 5)
    await fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Adatta' }))
    expect(Number(front.getAttribute('data-k'))).toBeCloseTo(k0, 5)
    const [, cy] = centre('152')
    await drag(front, at(front, -10, cy), at(front, -10 + 120 / Number(front.getAttribute('data-k')), cy))
    expect(screen.getByRole('group', { name: 'Dietro' })).toBeInTheDocument()
    expect(strokes()).toHaveLength(0)
    const back = screen.getByRole('group', { name: 'Dietro' })
    await paint(back, centre('252'), centre('253'))
    expect(strokes().length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('group', { name: 'Dietro' })).toBeInTheDocument()
  })

  it('Disegna: a finger paints a stroke that pulls in the regions it crosses; a tap is a dot; the paint stays when it is off', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('group', { name: 'Davanti' })
    expect(screen.getByRole('button', { name: 'Annulla tratto' })).toBeDisabled()

    await paint(front, centre('152'), centre('160'))
    // One gesture, three segments: three pieces, each clipped to its own segment.
    expect(strokes()).toHaveLength(3)
    const clip = strokes()[0]!.parentElement!.getAttribute('clip-path')!
    expect(clip).toMatch(/^url\(#.*-152\)$/)
    const clipPath = document.getElementById(clip.slice(5, -1))!
    expect(clipPath.tagName).toBe('clipPath')
    expect(clipPath.querySelector('path')!.getAttribute('d')).toBe(document.querySelector('.region[data-region="152"]')!.getAttribute('d'))
    expect(screen.getByText('coscia sx, ginocchio sx, stinco sx')).toBeInTheDocument()
    // Mirror is on, but a drawing is one-sided.
    expect(screen.queryByText(/cosce|ginocchia|stinchi/)).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Dietro' }))
    const back = screen.getByRole('group', { name: 'Dietro' })
    const [cx, cy] = centre('261')
    await fireEvent.pointerDown(back, finger(1, at(back, cx, cy)))
    await fireEvent.pointerUp(back, finger(1, at(back, cx, cy)))
    expect(strokes()).toHaveLength(1)
    expect(strokes()[0]!.getAttribute('d')).toMatch(/ l 0.01 0$/)
    expect(screen.getByText('coscia sx, ginocchio sx, stinco sx + 1')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(strokes()).toHaveLength(0)
    // The regions the dot pulled in stay.
    expect(screen.getByText('coscia sx, ginocchio sx, stinco sx + 1')).toBeInTheDocument()

    // Paint off: the segments are back to tap, the brush's tools fold away, the mind is back, the paint itself shows.
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    expect(screen.queryByRole('button', { name: 'Annulla tratto' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: buttock() })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Davanti' }))
    expect(strokes()).toHaveLength(3)

    await salva()
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
    // A new draft opens with the paint off.
    expect(screen.getByRole('button', { name: 'Disegna' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('Annulla tratto takes back a whole gesture, then one piece at a time on a loaded drawing', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('group', { name: 'Davanti' })
    await paint(front, centre('110'), centre('112'))
    await paint(front, centre('152'), centre('160'))
    expect(strokes()).toHaveLength(5)
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(strokes()).toHaveLength(2)
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(strokes()).toHaveLength(0)
  })

  it('a touch the system cancels paints nothing', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('group', { name: 'Davanti' })
    await fireEvent.pointerDown(front, finger(1, at(front, ...centre('152'))))
    await fireEvent.pointerMove(front, finger(1, at(front, ...centre('160'))))
    await fireEvent.pointerCancel(front, finger(1, at(front, ...centre('160'))))
    expect(strokes()).toHaveLength(0)
    expect(screen.getByText('Nessuna zona: tocca la figura')).toBeInTheDocument()
  })

  it("Annulla tratto takes back the current layer's own last gesture, never another layer's", async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('group', { name: 'Davanti' })
    await paint(front, centre('110'), centre('112'))
    const onA = strokes().length
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    await paint(screen.getByRole('group', { name: 'Davanti' }), centre('152'), centre('160'))
    const onB = strokes().length - onA
    expect(onB).not.toBe(onA)
    // Back on the first layer: its gesture goes, the second layer's paint stays.
    await fireEvent.click(document.querySelectorAll<HTMLElement>('.chip.area')[0])
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(strokes()).toHaveLength(onB)
    await fireEvent.click(document.querySelectorAll<HTMLElement>('.chip.area')[1])
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(strokes()).toHaveLength(0)
  })

  it('two fingers pan and pinch without painting, from the fitted figure; a turn fits it again', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Spalla sx' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const svg = screen.getByRole('group', { name: 'Davanti' })
    const k = Number(svg.getAttribute('data-k'))
    const ty = Number(svg.getAttribute('data-ty'))
    // A finger down, then a second one: the first stroke is dropped, the pair pans.
    await fireEvent.pointerDown(svg, finger(1, at(svg, ...centre('110'))))
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
    expect(strokes()).toHaveLength(0)
    // Every finger up: painting works again.
    await fireEvent.pointerDown(svg, finger(1, at(svg, ...centre('110'))))
    await fireEvent.pointerUp(svg, finger(1, at(svg, ...centre('110'))))
    expect(strokes()).toHaveLength(1)
    // A turn shows the whole other side, fitted on its own box.
    await fireEvent.click(screen.getByRole('button', { name: 'Dietro' }))
    const back = screen.getByRole('group', { name: 'Dietro' })
    const bb = viewBox(prefs.figure, 'back')
    const kb = Number(back.getAttribute('data-k'))
    expect(kb).toBeCloseTo(Math.min((300 - 152) / bb.w, (320 - 16) / bb.h), 5)
    expect(Number(back.getAttribute('data-ty')) + kb * (bb.y + bb.h / 2)).toBeCloseTo(160, 5)
  })

  it('full body takes strokes without touching the regions, and Cancella disegno is undoable', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Tutto il corpo' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const svg = screen.getByRole('group', { name: 'Davanti' })
    await paint(svg, centre('110'), centre('112'))
    await paint(svg, centre('152'), centre('154'))
    expect(strokes()).toHaveLength(4)
    await fireEvent.click(screen.getByRole('button', { name: 'Cancella disegno' }))
    expect(strokes()).toHaveLength(0)
    expect(await screen.findByText('Disegno cancellato')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(strokes()).toHaveLength(4)
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers[0].regions).toEqual(['*'])
    expect(e.layers[0].strokes).toHaveLength(4)
  })

  it('deselecting a painted segment takes its paint along, with undo; the rest of the drawing stays', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const svg = screen.getByRole('group', { name: 'Davanti' })
    await paint(svg, centre('152'), centre('160'))
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    expect(screen.getByText('coscia sx, ginocchio sx, stinco sx')).toBeInTheDocument()
    const knee = () => screen.getByRole('button', { name: regionLabel('154', t) })
    await fireEvent.click(knee())
    expect(strokes()).toHaveLength(2)
    expect(knee()).toHaveAttribute('aria-pressed', 'false')
    expect(await screen.findByText('Tratti cancellati')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(strokes()).toHaveLength(3)
    expect(knee()).toHaveAttribute('aria-pressed', 'true')
    // Deselecting a segment that was only tapped shows no toast: nothing was lost.
    await fireEvent.click(screen.getByRole('button', { name: regionLabel('110', t) }))
    await fireEvent.click(screen.getByRole('button', { name: regionLabel('110', t) }))
    expect(strokes()).toHaveLength(3)
  })

  it('a stroke drawn on the other figure keeps its regions but is not drawn on this one', async () => {
    const stroke: Stroke = { region: '152', fig: 'male', view: 'front', points: [[100, 300]], w: 8 }
    // A piece tagged with a segment this build does not know is skipped, not fatal.
    const alien: Stroke = { region: '999', fig: 'female', view: 'front', points: [[100, 300]], w: 8 }
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 6 }, strokes: [stroke, alien] }] })
    render(App)
    await go('Diario')
    await fireEvent.click(await screen.findByText('coscia sx'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(strokes()).toHaveLength(0)
    prefs.figure = 'male'
    await waitFor(() => expect(strokes()).toHaveLength(1))
    prefs.figure = 'female'
  })
})

describe('Times that cannot be', () => {
  it('an episode that ends before it starts is not saved: it says why and shows the Fine row', async () => {
    render(App)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    const end = screen.getByRole('group', { name: 'Fine' })
    await fireEvent.click(within(end).getByRole('button', { name: '3h fa' }))
    await salva()
    expect((await screen.findByText("La fine è prima dell'inizio")).closest('.toast')).toHaveClass('refusal')
    expect(await db.entries.count()).toBe(0)
    // Nothing was reset: the draft is there to be fixed.
    expect(within(end).getByRole('button', { name: '3h fa' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('before 08:00 there is no Stamattina, which would be in the future; from 08:00 there is', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 8, 30, 0, 30))
      const { unmount } = render(App)
      await more()
      let when = screen.getByRole('group', { name: 'Quando' })
      expect(within(when).queryByRole('button', { name: 'Stamattina' })).not.toBeInTheDocument()
      expect(within(when).getByRole('button', { name: 'Ieri sera' })).toBeInTheDocument()
      unmount()
      vi.setSystemTime(new Date(2026, 8, 30, 9, 0))
      render(App)
      await more()
      when = screen.getByRole('group', { name: 'Quando' })
      expect(within(when).getByRole('button', { name: 'Stamattina' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it("the picker's field offers no time after now", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 8, 30, 9, 5))
      render(App)
      await more()
      await fireEvent.click(within(screen.getByRole('group', { name: 'Quando' })).getByRole('button', { name: 'Scegli…' }))
      expect(document.querySelector('input[type="datetime-local"]')).toHaveAttribute('max', '2026-09-30T09:05')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('The kind is chosen per entry', () => {
  it('a relaunch opens on Cronico, whatever the last save was', async () => {
    const { unmount } = render(App)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    unmount()
    render(App)
    await more()
    expect(screen.getByRole('button', { name: 'Cronico' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Azzera starts the form over, kind included, and its undo brings Episodio back', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Azzera' }))
    if (!screen.queryByRole('button', { name: 'Cronico' })) await more()
    expect(screen.getByRole('button', { name: 'Cronico' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
    if (!screen.queryByRole('button', { name: 'Episodio' })) await more()
    expect(screen.getByRole('button', { name: 'Episodio' })).toHaveAttribute('aria-pressed', 'true')
  })
})
