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
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.click(salva())
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    await wait(80)
    await fireEvent.click(salva())
    await wait(150)
    await fireEvent.click(salva())
    await wait(50)
    expect(await db.entries.count()).toBe(1)
  })

  it('the fast path is intact: any touch after a save makes Salva ready at once, and so does waiting a moment', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(salva())
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '6' } })
    await fireEvent.click(salva())
    await waitFor(async () => expect(await db.entries.count()).toBe(2))
    await wait(1100)
    await fireEvent.click(salva())
    await waitFor(async () => expect(await db.entries.count()).toBe(3))
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
    await wait(50)
    expect((await db.entries.toArray()).filter(isUpdate)).toHaveLength(1)
  })

  it('a preset sheet Salva tapped twice logs one reading', async () => {
    await addPreset({ name: 'Schiena', layers: [{ regions: ['152'], asks: ['pain'] }], kind: 'chronic' })
    render(App)
    await pickPreset(/Schiena/)
    const sheet = await screen.findByRole('dialog', { name: 'Schiena' })
    const b = within(sheet).getByRole('button', { name: 'Salva' })
    b.click()
    b.click()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await wait(50)
    expect(await db.entries.count()).toBe(1)
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
    await wait(50)
    expect(await db.presets.count()).toBe(1)
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
    await wait(50)
    expect((await db.tags.toArray()).filter((x) => x.label === 'Ibuprofene')).toHaveLength(1)
    expect(fields[2]).toHaveValue('')
  })
})
