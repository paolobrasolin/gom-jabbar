import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addPreset } from '../lib/presets'
import App from '../App.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
})

describe('Settings presets', () => {
  it('lists presets and deletes with undo', async () => {
    await addPreset({ name: 'Schiena', areas: [], symptomIds: ['pain'], tags: [], ongoing: false })
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Impostazioni' }))
    const row = (await screen.findByText('Schiena')).closest('.preset')!
    await fireEvent.click(row.querySelector('button')!)
    await waitFor(async () => expect(await db.presets.count()).toBe(0))
    await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.presets.count()).toBe(1))
  })

  it('explains how to create the first preset', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Impostazioni' }))
    expect(await screen.findByText(/Nessun preset/)).toBeInTheDocument()
  })
})
