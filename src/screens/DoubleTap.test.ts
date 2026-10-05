/** U2 + D21: a double tap on a save button records one reading, never two. */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addEntry, isUpdate } from '../lib/entries'
import { addPreset } from '../lib/presets'
import { dismissToast } from '../lib/toast.svelte'
import { go, openEpisode, pickPreset } from '../test/nav'
import App from '../App.svelte'
import VocabEditor from '../components/VocabEditor.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
  history.replaceState(null, '', '/')
  dismissToast()
})
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const salva = () => screen.getByRole('button', { name: 'Salva' })

describe('Log Salva', () => {
  it('a second tap right after a save does not log the empty form', async () => {
    render(App)
    await fireEvent.input(await screen.findByRole('slider', { name: 'Dolore' }), { target: { value: '5' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.click(salva())
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    await wait(80)
    await fireEvent.click(salva())
    await wait(150)
    await fireEvent.click(salva())
    // Those taps stored nothing: once a real save after them has landed, there are two readings, not three or four.
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '7' } })
    await fireEvent.click(salva())
    await waitFor(async () => expect((await db.entries.toArray()).some((e) => e.layers[0].readings.pain === 7)).toBe(true))
    expect((await db.entries.toArray()).map((e) => e.layers[0].readings.pain).sort()).toEqual([5, 7])
  })

  it('the fast path is intact: setting a level after a save makes Salva ready at once', async () => {
    render(App)
    await fireEvent.input(await screen.findByRole('slider', { name: 'Dolore' }), { target: { value: '4' } })
    await fireEvent.click(salva())
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '6' } })
    await fireEvent.click(salva())
    await waitFor(async () => expect(await db.entries.count()).toBe(2))
    // Later, Salva on the blank form asks for a level rather than storing one nobody chose.
    await wait(1100)
    await fireEvent.click(salva())
    expect(await screen.findByText('Quanto? Sposta la barra')).toBeInTheDocument()
    expect(await db.entries.count()).toBe(2)
  })
})

describe('sheet buttons', () => {
  it('Aggiorna tapped twice logs one update', async () => {
    await addEntry({ at: ago(60), kind: 'episode', layers: [{ regions: ['152'], readings: { pain: 6 } }] })
    render(App)
    const sheet = await openEpisode()
    const b = within(sheet).getByRole('button', { name: 'Aggiorna' })
    b.click()
    b.click()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Once an Aggiorna after them has landed, there are two updates, not three.
    const again = await openEpisode()
    await fireEvent.input(within(again).getByRole('slider', { name: 'Dolore' }), { target: { value: '9' } })
    await fireEvent.click(within(again).getByRole('button', { name: 'Aggiorna' }))
    const updates = async () => (await db.entries.toArray()).filter(isUpdate)
    await waitFor(async () => expect((await updates()).some((e) => e.layers[0].readings.pain === 9)).toBe(true))
    expect(await updates()).toHaveLength(2)
  })

  it('a preset sheet Salva tapped twice logs one reading', async () => {
    await addPreset({ name: 'Schiena', layers: [{ regions: ['152'], asks: ['pain'] }], kind: 'chronic' })
    render(App)
    await pickPreset(/Schiena/)
    const sheet = await screen.findByRole('dialog', { name: 'Schiena' })
    await fireEvent.input(within(sheet).getByRole('slider', { name: 'Dolore' }), { target: { value: '3' } })
    const b = within(sheet).getByRole('button', { name: 'Salva' })
    b.click()
    b.click()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Once a reading after them has landed, there are two, not three.
    await pickPreset(/Schiena/)
    const again = await screen.findByRole('dialog', { name: 'Schiena' })
    await fireEvent.input(within(again).getByRole('slider', { name: 'Dolore' }), { target: { value: '8' } })
    await fireEvent.click(within(again).getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect((await db.entries.toArray()).some((e) => e.layers[0].readings.pain === 8)).toBe(true))
    expect((await db.entries.toArray()).map((e) => e.layers[0].readings.pain).sort()).toEqual([3, 8])
  })

  it('the edit sheet Salva tapped twice saves once and shows one toast', async () => {
    await addEntry({ at: ago(30), layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    render(App)
    await go('Diario')
    await fireEvent.click((await screen.findAllByRole('button', { name: /\d\d:\d\d/ }))[0])
    const sheet = await screen.findByRole('dialog', { name: 'Modifica' })
    const before = (await db.entries.toArray())[0].updatedAt
    await wait(5)
    const b = within(sheet).getByRole('button', { name: 'Salva' })
    b.click()
    b.click()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await db.entries.toArray())[0].updatedAt).not.toBe(before)
  })
})

describe('forms that create', () => {
  it('Crea preset tapped twice makes one preset, and its undo leaves none', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await pickPreset('Nuovo preset')
    const form = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    await within(within(form).getByRole('group', { name: 'Chiede' })).findByRole('button', { name: 'Dolore' })
    await fireEvent.input(within(form).getByRole('textbox', { name: 'Nome del preset' }), { target: { value: 'Coscia' } })
    const b = within(form).getByRole('button', { name: 'Crea preset' })
    b.click()
    b.click()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuovo preset' })).not.toBeInTheDocument())
    // The undo lands after any second preset would have: with one made, it leaves none.
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.presets.count()).toBe(0))
  })

  it('+ Aggiungi tapped twice adds the tag once', async () => {
    render(VocabEditor, { table: 'tags' })
    const fields = await screen.findAllByPlaceholderText('Nuovo…')
    await fireEvent.input(fields[2], { target: { value: 'Ibuprofene' } })
    const add = fields[2].closest('.item')!.querySelector('button')!
    add.click()
    add.click()
    const named = async (label: string) => (await db.tags.toArray()).filter((x) => x.label === label)
    await waitFor(async () => expect(await named('Ibuprofene')).toHaveLength(1))
    expect(fields[2]).toHaveValue('')
    // Once an add after them has landed, a second Ibuprofene would have too.
    await fireEvent.input(fields[2], { target: { value: 'Paracetamolo' } })
    add.click()
    await waitFor(async () => expect(await named('Paracetamolo')).toHaveLength(1))
    expect(await named('Ibuprofene')).toHaveLength(1)
  })
})
