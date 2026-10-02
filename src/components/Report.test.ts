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

/** Seven days: an entry with a note today, a 2h episode two days ago that eased from 6 to 3 (a head and an update), a quiet swelling reading before that. */
function fixture(): { from: Date; entries: Entry[] } {
  const from = rangeStart(7)
  const today = makeEntry({ at: at(0), layers: [{ regions: ['152'], readings: { pain: 8 }, tags: ['rest'] }], note: 'nota uno' })
  const episode = makeEntry({ at: at(2, 9), kind: 'episode', endedAt: at(2, 11), layers: [{ regions: ['152', '153'], readings: { pain: 6 } }] })
  const update = { ...makeEntry({ at: at(2, 10), kind: 'episode', layers: [{ regions: ['152', '153'], readings: { pain: 3 } }] }), episodeId: episode.id }
  const quiet = makeEntry({ at: at(3), readings: { pain: 2, swelling: 5 } })
  return { from, entries: [today, episode, update, quiet] }
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

describe('Report rows', () => {
  it('a noted entry that read nothing shows no level, and a 0 is named after its symptom (#114)', () => {
    const entries = [
      makeEntry({ at: at(1), layers: [{ regions: ['152'], readings: {}, tags: [] }], note: 'solo dove' }),
      makeEntry({ at: at(0), layers: [{ regions: ['mind'], readings: { anxiety: 0 }, tags: [] }], note: 'tranquilla' }),
    ]
    render(Report, { days: 7, from: rangeStart(7), entries, tags: DEFAULT_TAGS, symptoms: DEFAULT_SYMPTOMS, onclose: vi.fn() })
    const row = (note: string) => screen.getByText(note).closest('tr')!
    expect(row('solo dove').querySelector('.pill')).toHaveTextContent('–')
    expect(row('tranquilla').querySelector('.pill')).toHaveTextContent('0')
    expect(row('tranquilla')).toHaveTextContent('ansia')
  })
})

describe('Report page', () => {
  it('has the title, the range and the headline numbers', () => {
    const { from } = open()
    expect(screen.getByRole('heading', { level: 1, name: 'Diario dei sintomi' })).toBeInTheDocument()
    const to = new Date(from.getTime() + 7 * 86_400_000 - 1)
    expect(screen.getByText(`Dal ${fmt(from)} al ${fmt(to)} · generato il ${fmt(new Date())}`)).toBeInTheDocument()
    const box = (k: string) => screen.getByText(k).parentElement!
    // Every reading counts, the episode's update too.
    expect(box('Voci')).toHaveTextContent('4')
    expect(box('Voci')).toHaveTextContent('in 3 giorni')
    expect(box('Media giornaliera')).toHaveTextContent('4,8')
    expect(box('Media giornaliera')).toHaveTextContent('max 8')
    expect(screen.getByText('Sintomo: Dolore')).toBeInTheDocument()
    expect(box('Giorni ≥ 5')).toHaveTextContent('2')
    expect(box('Episodi')).toHaveTextContent('1')
    expect(box('Episodi')).toHaveTextContent('durata mediana 2h')
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
    expect(sym).toHaveTextContent('1 giorno')
    const tags = screen.getByRole('heading', { name: 'Tag' }).nextElementSibling!
    // Days a tag was used on, not entries.
    expect(within(tags as HTMLElement).getByRole('columnheader', { name: 'Giorni' })).toBeInTheDocument()
    expect(within(tags as HTMLElement).getByRole('row', { name: /Riposo/ })).toHaveTextContent(/^Riposo\s*1\s*–\s*–$/)
    const notable = screen.getByRole('heading', { name: 'Episodi e note' }).nextElementSibling!
    const rows = within(notable as HTMLElement).getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('cosce · 2h · 6 → 3')
    // Ended: the worst it got, not the 3 it ended on.
    expect(rows[0].querySelector('.pill')).toHaveTextContent('6')
    expect(rows[1]).toHaveTextContent('coscia sx · Riposo')
    expect(rows[1]).toHaveTextContent('nota uno')
  })

  it('ends with what it is: a personal diary, not clinically validated, not a medical device', () => {
    open()
    const foot = screen.getByText('Diario personale: dati inseriti dalla persona, non validati clinicamente. Gom Jabbar non è un dispositivo medico.')
    expect(foot.closest('article')).not.toBeNull()
    expect(foot.compareDocumentPosition(screen.getByText('nota uno')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
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
    expect(html).toContain('<title>Diario dei sintomi</title>')
    expect(html).toContain('<style>')
    expect(html).toContain('<body class="printing">')
    expect(html).toContain('<article')
    expect(html).toContain('nota uno')
    expect(html).toContain('Diario personale: dati inseriti dalla persona, non validati clinicamente. Gom Jabbar non è un dispositivo medico.')
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
    expect(toastState.current?.kind).toBe('failure')
  })
})

describe('Report for another symptom (#38)', () => {
  it('reads the symptom it is given: numbers, map and chart, named once', () => {
    const { from, entries } = fixture()
    render(Report, { days: 7, from, entries, tags: DEFAULT_TAGS, symptoms: DEFAULT_SYMPTOMS, symptom: 'swelling', onclose: vi.fn() })
    expect(screen.getByText('Sintomo: Gonfiore')).toBeInTheDocument()
    const box = (k: string) => screen.getByText(k).parentElement!
    expect(box('Media giornaliera')).toHaveTextContent('5')
    expect(box('Giorni ≥ 5')).toHaveTextContent('1')
    expect(screen.getByRole('img', { name: 'Gonfiore per giorno' })).toBeInTheDocument()
    // Swelling was read without a place: the map stays empty.
    expect(document.querySelector('[data-region="152"]')).not.toHaveClass('on')
    // Altri sintomi: pain among them now.
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toContain('Altri sintomi')
    expect(screen.getByText('Altri sintomi').nextElementSibling).toHaveTextContent('Dolore')
  })

  it('leaves out the figures of a symptom nothing in range read', () => {
    const from = rangeStart(7)
    const entries = [makeEntry({ at: at(0), layers: [{ regions: ['152'], readings: {}, tags: [] }] })]
    render(Report, { days: 7, from, entries, tags: DEFAULT_TAGS, symptoms: DEFAULT_SYMPTOMS, onclose: vi.fn() })
    expect(screen.queryByText('Media giornaliera')).not.toBeInTheDocument()
    expect(screen.queryByText('Giorni ≥ 5')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Sintomo:/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).not.toContain('Nel tempo')
  })
})

describe('Report strokes', () => {
  it('shades the strokes over the figures', () => {
    const onclose = vi.fn()
    const { from, entries } = fixture()
    entries[0].layers[0].strokes = [{ region: '152', fig: 'female', view: 'front', points: [[180, 300], [184, 330]], w: 8 }]
    render(Report, { days: 7, from, entries, tags: DEFAULT_TAGS, symptoms: DEFAULT_SYMPTOMS, onclose })
    expect(document.querySelectorAll('.stroke')).toHaveLength(1)
  })
})
