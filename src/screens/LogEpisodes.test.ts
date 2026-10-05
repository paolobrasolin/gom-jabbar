import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { episodesButton, episodeItems, salva } from '../test/nav'
import App from '../App.svelte'
import { addEntry } from '../lib/entries'
import { resetLog, more, body } from '../test/log'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetLog()
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
