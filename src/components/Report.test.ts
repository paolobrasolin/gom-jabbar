import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { prefs } from '../lib/prefs.svelte'
import { makeEntry } from '../lib/entries'
import { rangeStart } from '../lib/stats'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from '../lib/vocabulary'
import { toastState, dismissToast, showToast } from '../lib/toast.svelte'
import type { Entry } from '../lib/types'
import Report from './Report.svelte'
import { readFileSync } from 'node:fs'

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

describe('Report tags', () => {
  it('list tag use in days and nothing else: no comparison of days with and without (#114, #120)', () => {
    const entries = [
      ...Array.from({ length: 6 }, (_, i) => makeEntry({ at: at(i), layers: [{ regions: ['152'], readings: { pain: 8 }, tags: ['rest'] }] })),
      ...Array.from({ length: 5 }, (_, i) => makeEntry({ at: at(i + 6), layers: [{ regions: ['152'], readings: { pain: 3 }, tags: [] }] })),
    ]
    render(Report, { days: 30, from: rangeStart(30), entries, tags: DEFAULT_TAGS, symptoms: DEFAULT_SYMPTOMS, onclose: vi.fn() })
    const table = screen.getByRole('heading', { level: 2, name: 'Rimedi' }).nextElementSibling as HTMLElement
    expect([...within(table).getByText('Riposo').closest('tr')!.querySelectorAll('td')].map((td) => td.textContent)).toEqual(['Riposo', '6 gg'])
    expect(screen.queryByText(/descrittivo/)).toBeNull()
  })

  it('groups the tags, Farmaci, Rimedi, Contesto, each under its own heading, no Tag heading over them (#120)', () => {
    const tagged = (n: number, tags: string[]) => makeEntry({ at: at(n), layers: [{ regions: ['152'], readings: { pain: 4 }, tags }] })
    const tags = [...DEFAULT_TAGS, { id: 'ibu', label: 'Ibuprofene', group: 'medication' as const, enabled: true, order: 99 }]
    render(Report, { days: 30, from: rangeStart(30), entries: [tagged(0, ['stress', 'ibu']), tagged(1, ['rest', 'ibu']), tagged(2, ['stress'])], tags, symptoms: DEFAULT_SYMPTOMS, onclose: vi.fn() })
    const group = (name: string) => [...(screen.getByRole('heading', { level: 2, name }).nextElementSibling as HTMLElement).querySelectorAll('tr')].map((tr) => tr.textContent)
    // Days as "gg" in the report's narrow tables (#120).
    expect(group('Farmaci')).toEqual(['Ibuprofene2 gg'])
    expect(group('Rimedi')).toEqual(['Riposo1 gg'])
    expect(group('Contesto')).toEqual(['Stress2 gg'])
    expect(screen.queryByRole('heading', { name: 'Tag' })).toBeNull()
    // In that order, after Altri sintomi, before the diary.
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(names.slice(names.indexOf('Farmaci'), names.indexOf('Contesto') + 1)).toEqual(['Farmaci', 'Rimedi', 'Contesto'])
    // A group with nothing used has no heading.
    render(Report, { days: 30, from: rangeStart(30), entries: [tagged(0, ['rest'])], tags, symptoms: DEFAULT_SYMPTOMS, onclose: vi.fn() })
    expect(screen.getAllByRole('heading', { level: 2, name: 'Rimedi' })).toHaveLength(2)
    expect(screen.getAllByRole('heading', { level: 2, name: 'Farmaci' })).toHaveLength(1)
  })

  it('repeats its disclaimer at the foot of every printed page, and keeps it at the end (#120)', () => {
    render(Report, { days: 7, ...fixture(), tags: DEFAULT_TAGS, symptoms: DEFAULT_SYMPTOMS, onclose: vi.fn() })
    const article = document.querySelector('article.page')!
    // A page margin box, inside the article so the shared file carries it too: a doctor may read only the first page.
    const rule = [...article.querySelectorAll('style')].map((s) => s.textContent).join('')
    expect(rule).toMatch(/@page\s*\{\s*@bottom-left\s*\{[^}]*content:\s*"Diario personale: dati inseriti dalla persona/)
    expect(article.querySelector('footer.disclaimer')).toHaveTextContent('Gom Jabbar non è un dispositivo medico.')
  })

  it('starts the diary on a page of its own when printed (#120)', () => {
    render(Report, { days: 7, ...fixture(), tags: DEFAULT_TAGS, symptoms: DEFAULT_SYMPTOMS, onclose: vi.fn() })
    expect(screen.getByRole('heading', { level: 2, name: 'Episodi e note' }).parentElement).toHaveClass('diary')
  })
})

describe('Report page', () => {
  it('prints whole: the rules that hide the app around the report in print hide nothing inside it (#120)', () => {
    // Until #120 the header's `.bar` hid the bars of Quanto too, which share the class: on paper the chart was empty.
    // The stylesheet from disk: Vitest stubs CSS imports. Comments out, so a selector is a selector.
    const css = readFileSync('src/app.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const print = css.slice(css.indexOf('@media print'))
    const hiding = [...print.matchAll(/([^{}]+)\{[^}]*display:\s*none/g)].flatMap((m) => m[1].split(',').map((sel) => sel.trim()))
    expect(hiding.length).toBeGreaterThan(0)
    document.body.classList.add('printing')
    try {
      open()
      const report = document.querySelector('.report')!
      for (const sel of hiding) expect([...document.querySelectorAll(sel)].filter((el) => report.contains(el)), sel).toEqual([])
    } finally {
      document.body.classList.remove('printing')
    }
  })

  it('has the title, the range and the headline numbers', () => {
    const { from } = open()
    expect(screen.getByRole('heading', { level: 1, name: 'Diario dei sintomi' })).toBeInTheDocument()
    const to = new Date(from.getTime() + 7 * 86_400_000 - 1)
    expect(screen.getByText(`Dal ${fmt(from)} al ${fmt(to)} · generato il ${fmt(new Date())}`)).toBeInTheDocument()
    const box = (k: string) => screen.getByText(k).parentElement!
    // The two kinds of the log form (#120): the chronic readings in days, the episode apart.
    expect(box('Cronico').querySelector('b')).toHaveTextContent(/^2 gg su 7$/)
    expect(box('Cronico')).toHaveTextContent(/2 voci totali$/)
    // Each day at its highest, 8, 6 and 2 (#120): the lowest, the median, the highest, the days read.
    const figure = (k: string) => within(document.querySelector('.figs') as HTMLElement).getByText(k).nextElementSibling!
    expect([figure('Minimo'), figure('Mediana'), figure('Massimo'), figure('Giorni')].map((f) => f.textContent)).toEqual(['2', '6', '8', '3/7'])
    expect(screen.queryByText('Media giornaliera')).toBeNull()
    // The symptom's part under its own heading, after the whole diary's figures (#120); every reading counts, the episode's update too.
    const heading = screen.getByRole('heading', { level: 2, name: 'Quanto (Dolore)' })
    expect(box('Episodi').compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.compareDocumentPosition(figure('Mediana')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const days = screen.getByRole('list', { name: 'Numero di giorni per livello massimo' })
    expect(within(days).getAllByRole('listitem').filter((b) => !b.getAttribute('aria-label')!.endsWith(': 0 giorni')).map((b) => b.getAttribute('aria-label'))).toEqual(['2: 1 giorno', '6: 1 giorno', '8: 1 giorno'])
    expect(box('Episodi').querySelector('b')).toHaveTextContent(/^1 in 7 gg$/)
    expect(box('Episodi')).toHaveTextContent(/durata mediana 2h$/)
  })

  it('has the sections a doctor reads: map, chart, symptoms, tags, episodes and notes', () => {
    open()
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(names).toEqual(['Quanto (Dolore)', 'Dove (Dolore)', 'Quando', 'Altri sintomi (mediana)', 'Rimedi', 'Episodi e note'])
    expect(document.querySelector('[data-region="152"]')).toHaveClass('on')
    // The chart is static on paper: no tap targets.
    expect(screen.queryAllByRole('button', { name: /\d/ })).toHaveLength(0)
    // The heading says what the first number is, the median of the symptom's days (#120); the second says "gg".
    const sym = screen.getByRole('heading', { name: 'Altri sintomi (mediana)' }).nextElementSibling!
    expect(sym).toHaveTextContent('Gonfiore')
    expect(sym).toHaveTextContent('5')
    expect(sym).toHaveTextContent('1 gg')
    const tags = screen.getByRole('heading', { name: 'Rimedi' }).nextElementSibling!
    // Days a tag was used on, not entries.
    expect(within(tags as HTMLElement).getByRole('row', { name: /Riposo/ })).toHaveTextContent(/^Riposo\s*1 gg$/)
    const notable = screen.getByRole('heading', { name: 'Episodi e note' }).nextElementSibling!
    const rows = within(notable as HTMLElement).getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('cosce · 2h · 6 → 3')
    // Ended: the worst it got, not the 3 it ended on.
    expect(rows[0].querySelector('.pill')).toHaveTextContent('6')
    expect(rows[1]).toHaveTextContent('coscia sx · Riposo')
    expect(rows[1]).toHaveTextContent('nota uno')
  })

  it('ends with what it is: a personal diary, not clinically validated, summarised without interpretation, not a medical device', () => {
    open()
    const foot = screen.getByText('Diario personale: dati inseriti dalla persona, non validati clinicamente, riassunti senza interpretazione. Gom Jabbar non è un dispositivo medico.')
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
    expect(html).toContain('Diario personale: dati inseriti dalla persona, non validati clinicamente, riassunti senza interpretazione. Gom Jabbar non è un dispositivo medico.')
    expect(html).not.toContain('Condividi file')
    await waitFor(() => expect(toastState.current?.message).toBe('Riepilogo condiviso'))
  })

  it('says nothing when the share sheet is dismissed, complains when sharing fails', async () => {
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: async () => { throw new DOMException('cancelled', 'AbortError') } })
    const r = open()
    showToast('prima')
    const first = toastState.current!.id
    await fireEvent.click(screen.getByRole('button', { name: 'Condividi file' }))
    // The toast after the dismissed share is the next share's: the dismissed one showed none.
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share: async () => {} })
    await fireEvent.click(screen.getByRole('button', { name: 'Condividi file' }))
    await waitFor(() => expect(toastState.current?.message).toBe('Riepilogo condiviso'))
    expect(toastState.current!.id).toBe(first + 1)
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
    expect(screen.getByText('Quanto (Gonfiore)')).toBeInTheDocument()
    expect(screen.getByText('Dove (Gonfiore)')).toBeInTheDocument()
    const box = (k: string) => screen.getByText(k).parentElement!
    expect(screen.getByText('Mediana').nextElementSibling).toHaveTextContent(/^5$/)
    expect(screen.getByRole('img', { name: 'Gonfiore per giorno' })).toBeInTheDocument()
    // Swelling was read without a place: the map stays empty.
    expect(document.querySelector('[data-region="152"]')).not.toHaveClass('on')
    // Altri sintomi: pain among them now.
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toContain('Altri sintomi (mediana)')
    expect(screen.getByText('Altri sintomi (mediana)').nextElementSibling).toHaveTextContent('Dolore')
  })

  it('leaves out the figures of a symptom nothing in range read', () => {
    const from = rangeStart(7)
    const entries = [makeEntry({ at: at(0), layers: [{ regions: ['152'], readings: {}, tags: [] }] })]
    render(Report, { days: 7, from, entries, tags: DEFAULT_TAGS, symptoms: DEFAULT_SYMPTOMS, onclose: vi.fn() })
    expect(screen.queryByText('Mediana')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Numero di giorni per livello massimo' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Quanto/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toContain('Dove')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).not.toContain('Quando')
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
