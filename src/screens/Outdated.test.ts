/** A newer copy of the app owns the database (§4.1, #113): this one says so, saves nothing and keeps the draft for after the reload. */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/svelte'
import { db, resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { outdated } from '../lib/outdated.svelte'
import { reads } from '../lib/live.svelte'
import { failed } from '../lib/failure'
import { dismissToast, toastState } from '../lib/toast.svelte'
import { DRAFT_KEY } from '../lib/logDraft'
import { openNewer } from '../test/newer'
import App from '../App.svelte'

beforeEach(() => {
  resetDb()
  prefs.lang = 'it'
  history.replaceState(null, '', '/')
  dismissToast()
  outdated.value = false
  reads.failed = false
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const notice = () => screen.findByText("È uscita una nuova versione dell'app.")

describe('a newer copy upgrades the database while the app is open', () => {
  it('a lasting notice asks for a reload, Salva is off, the draft stays for the new release', async () => {
    const reload = vi.fn()
    render(App, { props: { reload } })
    await fireEvent.input(await screen.findByRole('slider', { name: 'Dolore' }), { target: { value: '6' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    const ahead = await openNewer(db.name)
    const msg = (await notice()).closest('.msg') as HTMLElement
    expect(msg.closest('[role=alert]')).not.toBeNull()
    expect(msg).toHaveClass('msg', 'standing')
    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'true')
    const kept = JSON.parse(localStorage.getItem(DRAFT_KEY)!).draft.layers[0]
    expect(kept.regions).toContain('153')
    expect(kept.readings).toEqual({ pain: 6 })
    await fireEvent.click(within(msg).getByRole('button', { name: 'Ricarica' }))
    expect(reload).toHaveBeenCalled()
    ahead.close()
  })

  it('says only that: not that the diary could not be read, and a write that fails adds no failure', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    const ahead = await openNewer(db.name)
    await notice()
    reads.failed = true
    failed(new Error('DatabaseClosedError'))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText(/Non riesco a leggere il diario/)).toBeNull()
    expect(toastState.current).toBeNull()
    ahead.close()
  })
})

describe('the app opened on a database a newer release left', () => {
  it('shows the same notice and nothing else', async () => {
    const name = db.name
    const ahead = await openNewer(name)
    ahead.close()
    resetDb(name)
    await db.open().catch(() => {})
    render(App)
    await notice()
    expect(screen.queryByText(/Non riesco a leggere il diario/)).toBeNull()
  })
})
