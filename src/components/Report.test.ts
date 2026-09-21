import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { prefs } from '../lib/prefs.svelte'
import { makeEntry } from '../lib/entries'
import { rangeStart } from '../lib/stats'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from '../lib/vocabulary'
import { toastState, dismissToast } from '../lib/toast.svelte'
import type { Entry } from '../lib/types'
import Report from './Report.svelte'

beforeEach(() => {
  prefs.lang = 'it'
  dismissToast()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function daysAgo(n: number, hour = 12): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d
}
const at = (n: number, hour = 12) => daysAgo(n, hour).toISOString()
const fmt = (d: Date) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)

/** Seven days: an entry with a note today, a 2h episode two days ago that eased from 6 to 3, a quiet swelling reading before that. */
function fixture(): { from: Date; entries: Entry[] } {
  const from = rangeStart(7)
  const today = makeEntry({ at: at(0), areas: [{ regions: ['152'], intensity: 8 }], tags: ['rest'], note: 'nota uno' })
  const episode = makeEntry({ at: at(2, 9), areas: [{ regions: ['152', '153'], intensity: 6 }] })
  episode.endedAt = at(2, 11)
  episode.readings = { pain: 3 }
  episode.history = [{ at: at(2, 9), readings: { pain: 6 } }, { at: at(2, 10), readings: { pain: 3 } }]
  const quiet = makeEntry({ at: at(3), readings: { pain: 2, swelling: 5 } })
  return { from, entries: [today, episode, quiet] }
}
function open() {
  const onclose = vi.fn()
  const { from, entries } = fixture()
  const r = render(Report, { days: 7, from, entries, tags: DEFAULT_TAGS, symptoms: DEFAULT_SYMPTOMS, onclose })
  return { ...r, onclose, from }
}
const readFile = (f: Blob) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error)
    fr.readAsText(f)
  })

describe('Report page', () => {
  it('has the title, the range and the headline numbers', () => {
    const { from } = open()
    expect(screen.getByRole('heading', { level: 1, name: 'Diario del dolore' })).toBeInTheDocument()
    const to = new Date(from.getTime() + 7 * 86_400_000 - 1)
    expect(screen.getByText(`Dal ${fmt(from)} al ${fmt(to)} · generato il ${fmt(new Date())}`)).toBeInTheDocument()
    const box = (k: string) => screen.getByText(k).parentElement!
    expect(box('Voci')).toHaveTextContent('3')
    expect(box('Voci')).toHaveTextContent('in 3 giorni')
    expect(box('Dolore medio')).toHaveTextContent('4.3')
    expect(box('Dolore medio')).toHaveTextContent('max 8')
    expect(box('Giorni ≥ 5')).toHaveTextContent('1')
    expect(box('Episodi')).toHaveTextContent('1')
    expect(box('Episodi')).toHaveTextContent('durata media 2h')
  })

  it('has the sections a doctor reads: map, chart, symptoms, tags, episodes and notes', () => {
    open()
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(names).toEqual(['Dove', 'Nel tempo', 'Altri sintomi', 'Tag', 'Episodi e note'])
    expect(document.querySelector('[data-region="152"]')).toHaveClass('on')
    // The chart is static on paper: no tap targets.
    expect(screen.queryAllByRole('button', { name: /\d/ })).toHaveLength(0)
    const sym = screen.getByRole('heading', { name: 'Altri sintomi' }).nextElementSibling!
    expect(sym).toHaveTextContent('Gonfiore')
    expect(sym).toHaveTextContent('5')
    expect(sym).toHaveTextContent('1 voci')
    const tags = screen.getByRole('heading', { name: 'Tag' }).nextElementSibling!
    expect(within(tags as HTMLElement).getByRole('row', { name: /Riposo/ })).toHaveTextContent(/^Riposo\s*1\s*–\s*–$/)
    const notable = screen.getByRole('heading', { name: 'Episodi e note' }).nextElementSibling!
    const rows = within(notable as HTMLElement).getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('gambe · 2h · 6 → 3')
    expect(rows[0].querySelector('.pill')).toHaveTextContent('3')
    expect(rows[1]).toHaveTextContent('gamba sx · Riposo')
    expect(rows[1]).toHaveTextContent('nota uno')
  })

  it('marks the body as printing while open, and closes', async () => {
    const { onclose, unmount } = open()
    expect(document.body).toHaveClass('printing')
    await fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(onclose).toHaveBeenCalled()
    unmount()
    expect(document.body).not.toHaveClass('printing')
  })

  it('print hands over to the browser', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    open()
    await fireEvent.click(screen.getByRole('button', { name: 'Stampa / PDF' }))
    expect(print).toHaveBeenCalled()
  })

  it('share produces one self-contained HTML file', async () => {
    const shared: File[] = []
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: async (d: ShareData) => void shared.push(...(d.files as File[])) })
    open()
    await fireEvent.click(screen.getByRole('button', { name: 'Condividi file' }))
    await waitFor(() => expect(shared).toHaveLength(1))
    expect(shared[0].name).toMatch(/^gom-jabbar-\d{8}\.html$/)
    expect(shared[0].type).toBe('text/html')
    const html = await readFile(shared[0])
    expect(html.startsWith('<!doctype html><html lang="it">')).toBe(true)
    expect(html).toContain('<title>Diario del dolore</title>')
    expect(html).toContain('<style>')
    expect(html).toContain('<body class="printing">')
    expect(html).toContain('<article')
    expect(html).toContain('nota uno')
    expect(html).not.toContain('Condividi file')
    await waitFor(() => expect(toastState.current?.message).toBe('Report condiviso'))
  })

  it('says nothing when the share sheet is dismissed, complains when sharing fails', async () => {
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: async () => { throw new DOMException('cancelled', 'AbortError') } })
    const r = open()
    await fireEvent.click(screen.getByRole('button', { name: 'Condividi file' }))
    await new Promise((res) => setTimeout(res, 10))
    expect(toastState.current).toBeNull()
    r.unmount()

    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: async () => { throw new Error('boom') } })
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new TypeError('no blobs here') })
    open()
    await fireEvent.click(screen.getByRole('button', { name: 'Condividi file' }))
    await waitFor(() => expect(toastState.current?.message).toBe('Esportazione non riuscita'))
  })
})

describe('Report strokes', () => {
  it('shades the strokes over the figures', () => {
    const onclose = vi.fn()
    const { from, entries } = fixture()
    entries[0].areas[0].strokes = [{ region: '152', fig: 'female', view: 'front', points: [[180, 300], [184, 330]], w: 8 }]
    render(Report, { days: 7, from, entries, tags: DEFAULT_TAGS, symptoms: DEFAULT_SYMPTOMS, onclose })
    expect(document.querySelectorAll('.stroke')).toHaveLength(1)
  })
})
