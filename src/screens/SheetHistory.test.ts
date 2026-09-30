/** A sheet is one step of history: Android's back closes the top sheet and nothing else. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addEntry } from '../lib/entries'
import { dismissToast } from '../lib/toast.svelte'
import { go, openEpisode, presetItem } from '../test/nav'
import App from '../App.svelte'

beforeEach(() => {
  resetDb()
  prefs.lang = 'it'
  history.replaceState(null, '', '/')
  dismissToast()
})
afterEach(() => {
  vi.restoreAllMocks()
})
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const tick = () => new Promise((r) => setTimeout(r, 30))
const dialog = () => screen.queryByRole('dialog')
async function openEdit() {
  await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
  return screen.findByRole('dialog', { name: 'Modifica' })
}

describe('sheets in history', () => {
  it('Diary: back closes the edit sheet and stays on the diary; the next back returns to the log', async () => {
    await addEntry({ at: ago(30), layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    render(App)
    await go('Diario')
    await openEdit()
    history.back()
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: 'Diario' })).toBeInTheDocument()
    history.back()
    await screen.findByRole('button', { name: 'Menu' })
  })

  it('Log: back closes the new-preset sheet and keeps the app and the draft', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.click(await presetItem('Nuovo preset'))
    await screen.findByRole('dialog')
    history.back()
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'true')
    expect(history.state).toBeNull()
  })

  it('Salva in the edit sheet: the sheet leaves history and the Salvato toast stays', async () => {
    await addEntry({ at: ago(30), layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    render(App)
    await go('Diario')
    const sheet = await openEdit()
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    await tick()
    expect(screen.getByText('Salvato')).toBeInTheDocument()
    expect(history.state).toMatchObject({ screen: 'diary' })
    expect(history.state?.sheet).toBeUndefined()
    history.back()
    await screen.findByRole('button', { name: 'Menu' })
  })

  it('Escape closes the sheet and takes its step out of history', async () => {
    await addEntry({ at: ago(30), layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    render(App)
    await go('Diario')
    await openEdit()
    await fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    await tick()
    expect(history.state).toMatchObject({ screen: 'diary' })
  })

  it('a sheet handing over to another (episode → Modifica): the second stays open, back closes it, and nothing is left open', async () => {
    await addEntry({ at: ago(60), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 6 } }] })
    render(App)
    const ep = await openEpisode()
    await fireEvent.click(within(ep).getByRole('button', { name: 'Modifica' }))
    await screen.findByRole('dialog', { name: 'Modifica' })
    await tick()
    expect(screen.getByRole('dialog', { name: 'Modifica' })).toBeInTheDocument()
    history.back()
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    await tick()
    expect(history.state).toBeNull()
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument()
  })

  it('a sheet opened while the last one is still giving its step back stays open, and back then closes it', async () => {
    await addEntry({ at: ago(30), layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    // Hold every step back for a while, as a slow browser would, so the second sheet opens before it lands.
    const real = history.back.bind(history)
    vi.spyOn(history, 'back').mockImplementation(() => void setTimeout(real, 100))
    render(App)
    await go('Diario')
    await openEdit()
    await fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    await tick()
    expect(history.back).toHaveBeenCalledTimes(1)
    await openEdit()
    await new Promise((r) => setTimeout(r, 200))
    expect(screen.getByRole('dialog', { name: 'Modifica' })).toBeInTheDocument()
    history.back()
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: 'Diario' })).toBeInTheDocument()
  })

  it('search: back from a sheet over the results keeps the search open with its words', async () => {
    await addEntry({ at: ago(30), layers: [{ regions: ['152'], readings: { pain: 4 } }], note: 'corsa' })
    render(App)
    await go('Diario')
    await fireEvent.click(screen.getByRole('button', { name: 'Cerca' }))
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'corsa' } })
    await openEdit()
    history.back()
    await waitFor(() => expect(dialog()).not.toBeInTheDocument())
    expect(screen.getByRole('searchbox')).toHaveValue('corsa')
    history.back()
    await waitFor(() => expect(screen.queryByRole('searchbox')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: 'Diario' })).toBeInTheDocument()
  })
})
