import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, waitFor, within } from '@testing-library/svelte'
import { showStartupError, startupFailed } from './startupError'
import { db, resetDb, NewerDatabaseError } from './db'
import { addEntry } from './entries'
import { parseImport } from './backup'
import { prefs } from './prefs.svelte'

beforeEach(() => {
  document.body.replaceChildren()
  prefs.lang = 'it'
})

describe('the startup storage error (#94)', () => {
  it('is a failure like any other: red, its icon, an alert, once', () => {
    showStartupError('Non riesco ad aprire l’archivio')
    showStartupError('Non riesco ad aprire l’archivio')
    const box = document.querySelectorAll('.msg.failure.startup')
    expect(box).toHaveLength(1)
    expect(box[0]).toHaveAttribute('role', 'alert')
    expect(box[0]).toHaveTextContent('Non riesco ad aprire l’archivio')
    const svg = box[0].querySelector('svg.icon')!
    expect(svg).toHaveAttribute('data-icon', 'failed')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
  })
})

describe('the database will not open (§4.1, #113)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('says the data is still on the phone and offers it raw, as a file Ripristina reads', async () => {
    resetDb()
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 6 } }], note: 'ancora qui' })
    db.close()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let blob: Blob | undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => ((blob = b as Blob), 'blob:x'))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    startupFailed(new Error('UpgradeError'), db.name)
    const box = document.querySelector<HTMLElement>('.msg.startup')!
    expect(box).toHaveTextContent('I dati restano sul telefono')
    expect(box).not.toHaveTextContent(/Chrome|Safari/)
    await fireEvent.click(within(box).getByRole('button', { name: 'Scarica i dati grezzi' }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect((blob as File).name).toMatch(/^gom-jabbar-grezzo-\d{8}\.json$/)
    const text = await new Promise<string>((ok) => {
      const r = new FileReader()
      r.onload = () => ok(r.result as string)
      r.readAsText(blob!)
    })
    expect(parseImport(text).entries[0].note).toBe('ancora qui')
  })

  it('no data at all, or none readable: says so in the same box', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    startupFailed(new Error('x'), 'gj-none-' + Math.random())
    const box = document.querySelector<HTMLElement>('.msg.startup')!
    await fireEvent.click(within(box).getByRole('button', { name: 'Scarica i dati grezzi' }))
    await waitFor(() => expect(box).toHaveTextContent('Su questo telefono non ci sono dati'))
    document.body.replaceChildren()
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('no', 'InvalidStateError')
    })
    startupFailed(new Error('x'))
    const again = document.querySelector<HTMLElement>('.msg.startup')!
    await fireEvent.click(within(again).getByRole('button', { name: 'Scarica i dati grezzi' }))
    await waitFor(() => expect(again).toHaveTextContent('Non riesco a leggere i dati'))
  })

  it('the share sheet closed without sharing: nothing to say', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    resetDb()
    await db.open()
    db.close()
    Object.assign(navigator, { share: vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')), canShare: () => true })
    try {
      startupFailed(new Error('x'), db.name)
      const box = document.querySelector<HTMLElement>('.msg.startup')!
      const button = within(box).getByRole('button', { name: 'Scarica i dati grezzi' })
      await fireEvent.click(button)
      await waitFor(() => expect(button).not.toBeDisabled())
      expect(box).toHaveTextContent('Non riesco ad aprire il diario')
    } finally {
      delete (navigator as { share?: unknown }).share
      delete (navigator as { canShare?: unknown }).canShare
    }
  })

  it('a database a newer release left is no failure: the app says so itself', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    startupFailed(new NewerDatabaseError())
    expect(document.querySelector('.msg.startup')).toBeNull()
  })
})
