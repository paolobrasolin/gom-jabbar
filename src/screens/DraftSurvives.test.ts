/** The log's draft survives leaving the log: ☰, back, a reload, Google's consent screen, Android killing the app. */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { dismissToast } from '../lib/toast.svelte'
import { go, back, salva } from '../test/nav'
import App from '../App.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
  history.replaceState(null, '', '/')
  dismissToast()
})
const more = () => fireEvent.click(screen.getByRole('button', { name: /^Altro/ }))

async function fill() {
  await fireEvent.input(await screen.findByRole('slider', { name: 'Dolore' }), { target: { value: '6' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
  await more()
  await fireEvent.input(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'dopo la corsa' } })
}
async function expectFilled() {
  await waitFor(() => expect(screen.getByRole('slider', { name: 'Dolore' })).toHaveAttribute('aria-valuetext', '6'))
  expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'true')
  await more()
  expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('dopo la corsa')
}

describe('the log draft', () => {
  it('is still there after a trip to the Diary', async () => {
    render(App)
    await fill()
    await go('Diario')
    await back()
    await expectFilled()
  })

  it('is still there after a reload, and a saved one does not come back', async () => {
    render(App)
    await fill()
    cleanup()
    render(App)
    await expectFilled()
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    cleanup()
    render(App)
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Dolore' })).toHaveAttribute('aria-valuetext', 'non indicato'))
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('a tag deleted while the draft waited is dropped at save, not stored as a dangling id', async () => {
    render(App)
    await fireEvent.input(await screen.findByRole('slider', { name: 'Dolore' }), { target: { value: '3' } })
    await more()
    await fireEvent.click((await screen.findAllByRole('button', { name: 'Calore' }))[0])
    await db.tags.delete('heat')
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect((await db.entries.toArray())[0].layers[0].tags).toEqual([])
  })
})
