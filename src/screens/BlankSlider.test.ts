/** A slider records nothing until it is touched: no value nobody chose (§6.1 item 7). */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addPreset } from '../lib/presets'
import { dismissToast, toastState } from '../lib/toast.svelte'
import { pickPreset } from '../test/nav'
import App from '../App.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
  history.replaceState(null, '', '/')
  dismissToast()
})

describe('a blank slider', () => {
  it('the log opens with the headline slider blank, and Salva with nothing measured asks for it', async () => {
    render(App)
    const slider = await screen.findByRole('slider', { name: 'Dolore' })
    expect(slider).toHaveAttribute('aria-valuetext', 'non indicato')
    expect(slider.closest('.slider')).toHaveTextContent('–')
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(toastState.current?.message).toBe('Quanto? Sposta la barra'))
    expect(toastState.current?.kind).toBe('refusal')
    expect(await db.entries.count()).toBe(0)
    expect(document.activeElement).toBe(slider)
  })

  it('a touched slider is saved, and the next form starts blank again, not at the last level', async () => {
    render(App)
    const slider = await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.input(slider, { target: { value: '4' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect((await db.entries.toArray())[0].layers[0].readings).toEqual({ pain: 4 })
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Dolore' })).toHaveAttribute('aria-valuetext', 'non indicato'))
  })

  it('0 is a value: a slider moved to 0 is saved as 0', async () => {
    render(App)
    const slider = await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.input(slider, { target: { value: '0' } })
    expect(slider).toHaveAttribute('aria-valuetext', '0 assente')
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect((await db.entries.toArray())[0].layers[0].readings).toEqual({ pain: 0 })
  })

  it('a preset sheet records only the sliders moved, and asks when none was', async () => {
    await addPreset({ name: 'Gambe', layers: [{ regions: ['152'], asks: ['pain', 'swelling'] }], kind: 'chronic' })
    render(App)
    await pickPreset(/Gambe/)
    const sheet = await screen.findByRole('dialog', { name: 'Gambe' })
    expect(within(sheet).getByRole('slider', { name: 'Gonfiore' })).toHaveAttribute('aria-valuetext', 'non indicato')
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(toastState.current?.message).toBe('Quanto? Sposta la barra'))
    expect(toastState.current?.kind).toBe('refusal')
    // The refused Salva stored nothing: once the next one has landed, its reading is the only one.
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Gonfiore' }), { target: { value: '6' } })
    await fireEvent.click(within(sheet).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect((await db.entries.toArray()).some((e) => e.layers[0].readings.swelling === 6)).toBe(true))
    expect((await db.entries.toArray()).map((e) => e.layers[0].readings)).toEqual([{ swelling: 6 }])
  })
})
