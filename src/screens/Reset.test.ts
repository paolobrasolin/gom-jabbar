import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb, db } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addEntry } from '../lib/entries'
import { dismissToast } from '../lib/toast.svelte'
import { fakeGoogle } from '../test/fakeDrive'
import { go } from '../test/nav'
import App from '../App.svelte'

let g: ReturnType<typeof fakeGoogle>
let reload: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  resetDb()
  localStorage.clear()
  prefs.lang = 'it'
  prefs.lastBackupAt = null
  history.replaceState(null, '', '/')
  dismissToast()
  g = fakeGoogle()
  reload = vi.fn<() => void>()
})

async function openReset() {
  render(App, { props: { cloud: g.provider, reload } })
  await go('Impostazioni')
  await fireEvent.click(screen.getByRole('button', { name: 'Cancella tutto' }))
  return screen.findByRole('dialog', { name: 'Cancella tutto' })
}

describe('Cancella tutto', () => {
  it('asks for the word, then deletes everything and reloads as a fresh install', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    localStorage.setItem('gj.prefs', JSON.stringify({ lang: 'it', figure: 'male' }))
    const sheet = await openReset()
    expect(sheet).toHaveTextContent('Cancella ogni voce, il vocabolario, i preset e le impostazioni. Non si può annullare.')
    expect(sheet).toHaveTextContent('Non hai mai fatto un backup: non resterà nulla.')
    const go = within(sheet).getByRole('button', { name: 'Cancella tutto' })
    const word = within(sheet).getByLabelText('Scrivi «cancella» per confermare')
    expect(go).toBeDisabled()
    await fireEvent.input(word, { target: { value: 'cancell' } })
    expect(go).toBeDisabled()
    await fireEvent.input(word, { target: { value: ' CANCELLA ' } })
    expect(go).toBeEnabled()
    await fireEvent.click(go)
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(localStorage.length).toBe(0)
    await db.open()
    expect(await db.entries.count()).toBe(0)
    expect(await db.symptoms.count()).toBe(9)
  })

  it('names the last backup, and says the Drive file stays', async () => {
    // A local time: at UTC+14 the instant 10:00Z is already the 21st.
    prefs.lastBackupAt = new Date(2026, 8, 20, 10).toISOString()
    g.signIn()
    await g.provider.whoami()
    const sheet = await openReset()
    expect(sheet).toHaveTextContent('Ultimo backup: 20 set 2026.')
    expect(sheet).toHaveTextContent("Il file su Drive resta dov'è; Drive viene scollegato da questo telefono (il permesso, da myaccount.google.com/permissions).")
  })

  it('does nothing when the sheet is closed, and forgets the word', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    let sheet = await openReset()
    await fireEvent.input(within(sheet).getByLabelText('Scrivi «cancella» per confermare'), { target: { value: 'cancella' } })
    await fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(reload).not.toHaveBeenCalled()
    expect(await db.entries.count()).toBe(1)
    await fireEvent.click(screen.getByRole('button', { name: 'Cancella tutto' }))
    sheet = await screen.findByRole('dialog', { name: 'Cancella tutto' })
    expect(within(sheet).getByLabelText('Scrivi «cancella» per confermare')).toHaveValue('')
    expect(within(sheet).getByRole('button', { name: 'Cancella tutto' })).toBeDisabled()
  })

  it('a delete that fails says so, keeps the diary, and the button works again', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const del = vi.spyOn(db, 'delete').mockRejectedValueOnce(new DOMException('The operation failed.', 'UnknownError'))
    const sheet = await openReset()
    await fireEvent.input(within(sheet).getByLabelText('Scrivi «cancella» per confermare'), { target: { value: 'cancella' } })
    const button = within(sheet).getByRole('button', { name: 'Cancella tutto' })
    await fireEvent.click(button)
    expect(await screen.findByText('Non riuscito: non è stato cancellato niente')).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
    expect(await db.entries.count()).toBe(1)
    expect(button).toBeEnabled()
    await fireEvent.click(button)
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(del).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
  })
})
