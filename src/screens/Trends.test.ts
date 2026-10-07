import { describe, it, expect, beforeEach, vi, onTestFinished } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addPreset, logPreset } from '../lib/presets'
import { addEntry, endEpisode, logUpdate, type EntryInput } from '../lib/entries'
import { intensityColor } from '../lib/color'
import { go, back } from '../test/nav'
import App from '../App.svelte'
import type { GomJabbarDB } from '../lib/db'

let db: GomJabbarDB
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
})
/** A change to the fresh database before the screen opens. */
const resetDbWith = async (change: (db: GomJabbarDB) => Promise<unknown>) => change(db)

/** Noon `n` days ago, so a test never straddles midnight. */
function daysAgo(n: number, hour = 12): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d
}
const at = (n: number, hour = 12) => daysAgo(n, hour).toISOString()
const legs = (pain: number, { tags, ...extra }: Partial<EntryInput> = {}): EntryInput => ({ layers: [{ regions: ['152'], readings: { pain }, tags: tags ?? [] }], ...extra })
const fmtFull = (d: Date) => new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }).format(d)

async function openTrends() {
  render(App)
  await go('Andamento')
}
const tile = (label: string) => screen.getByText(label).closest('.tile')!
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** The long ranges are Dal… a day picked (#120): a year is 365 days, today included. */
async function since(n: number) {
  await fireEvent.click(screen.getByRole('button', { name: /^Dal/ }))
  await fireEvent.change(screen.getByLabelText('Dal giorno'), { target: { value: ymd(daysAgo(n)) } })
}
/** The symptom card's first line, "Media giornaliera 3,9 · max 9" (#120). */
const meanLine = () => screen.getByText('Media giornaliera').parentElement!

describe('Trends summary', () => {
  it('says so when the range is empty, with the 30-day range selected', async () => {
    await openTrends()
    // Three fixed ranges and Dal…, one row: a year is Dal… a year ago (#120).
    const ranges = screen.getByRole('button', { name: '7 giorni' }).parentElement!
    expect([...ranges.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['7 giorni', '30 giorni', '90 giorni', 'Dal…'])
    expect(await screen.findByText('Nessuna voce in questo periodo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30 giorni' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '7 giorni' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Riepilogo del diario' })).not.toBeInTheDocument()
  })

  it('fills the tiles from the entries in range', async () => {
    await addEntry({ at: at(0, 9), ...legs(8) })
    await addEntry({ at: at(0, 10), ...legs(4) })
    const ep = await addEntry({ at: at(1, 9), kind: 'episode', ...legs(6) })
    await endEpisode(ep.id, at(1, 11))
    await openTrends()
    // The two kinds of the log form (#120): the chronic readings in days, their entries in the small print, the episode apart.
    await waitFor(() => expect(tile('Cronico')).toHaveTextContent('giorno su 30 · 2 voci'))
    expect(tile('Cronico').querySelector('b')).toHaveTextContent(/^1$/)
    expect(screen.queryByText('Voci')).toBeNull()
    await waitFor(() => expect(meanLine()).toHaveTextContent('Media giornaliera 6 · max 8'))
    // Each day at its worst (#114): 8 today, 6 yesterday.
    const days = screen.getByRole('list', { name: 'Giorni per livello peggiore' })
    expect(within(days).getAllByRole('listitem').map((b) => b.getAttribute('aria-label'))).toEqual(['0: 0 giorni', '1: 0 giorni', '2: 0 giorni', '3: 0 giorni', '4: 0 giorni', '5: 0 giorni', '6: 1 giorno', '7: 0 giorni', '8: 1 giorno', '9: 0 giorni', '10: 0 giorni'])
    expect(days.closest('.card')).toHaveTextContent('mediana 7 · 2 giorni letti su 30')
    expect(screen.queryByText('Giorni ≥ 5')).toBeNull()
    expect(tile('Episodi')).toHaveTextContent('1')
    expect(tile('Episodi')).toHaveTextContent('mediana 2h')
    // One begun and not ended: counted apart, not as a length.
    await addEntry({ at: at(0, 8), kind: 'episode', ...legs(5) })
    await waitFor(() => expect(tile('Episodi')).toHaveTextContent(/^Episodi2mediana 2h · 1 in corso$/))
    expect(tile('Episodi')).toHaveTextContent('2')
  })

  it('an entry dated after today is not in any range, as on the chart (#114)', async () => {
    await addEntry({ at: at(0), ...legs(3) })
    // A clock set wrong, a backup from a phone ahead in time: it is not part of the last 30 days.
    await addEntry({ at: at(-2), ...legs(9, { tags: ['rest'] }) })
    await openTrends()
    await waitFor(() => expect(tile('Cronico')).toHaveTextContent('1 voce'))
    await waitFor(() => expect(meanLine()).toHaveTextContent('max 3'))
    expect(screen.queryByText('Riposo')).toBeNull()
  })

  it('Dal… picks the first day: the range runs from it to today, and the report covers the same days (#114)', async () => {
    await addEntry({ at: at(12), ...legs(9) })
    await addEntry({ at: at(3), ...legs(2) })
    await addEntry({ at: at(0), ...legs(4) })
    await openTrends()
    await waitFor(() => expect(tile('Cronico')).toHaveTextContent('3 voci'))
    await fireEvent.click(screen.getByRole('button', { name: 'Dal…' }))
    const field = screen.getByLabelText('Dal giorno') as HTMLInputElement
    const day = daysAgo(5)
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    // No day after today: the range ends today.
    const today = daysAgo(0)
    expect(field.max).toBe(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
    await fireEvent.change(field, { target: { value: ymd } })
    await waitFor(() => expect(tile('Cronico')).toHaveTextContent('2 voci'))
    expect(meanLine()).toHaveTextContent('max 4')
    const chip = screen.getByRole('button', { name: `Dal ${new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(day)}` })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '30 giorni' })).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(screen.getByRole('button', { name: 'Riepilogo del diario' }))
    const fmt = (d: Date) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
    expect(screen.getByText(new RegExp(`^Dal ${fmt(day)} al ${fmt(daysAgo(0))}`))).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    // A fixed range again: the picked day is let go.
    await fireEvent.click(screen.getByRole('button', { name: '30 giorni' }))
    await waitFor(() => expect(tile('Cronico')).toHaveTextContent('3 voci'))
    expect(screen.getByRole('button', { name: 'Dal…' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('Dal… refuses a day after today and an emptied field, and a second tap puts the field away', async () => {
    await addEntry({ at: at(0), ...legs(4) })
    await openTrends()
    await fireEvent.click(await screen.findByRole('button', { name: 'Dal…' }))
    const field = screen.getByLabelText('Dal giorno') as HTMLInputElement
    const later = daysAgo(-3)
    await fireEvent.change(field, { target: { value: `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-${String(later.getDate()).padStart(2, '0')}` } })
    await fireEvent.change(field, { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Dal…' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '30 giorni' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Dal…' }))
    expect(screen.queryByLabelText('Dal giorno')).toBeNull()
  })

  it('the report button sits under the ranges, before the figures (#114)', async () => {
    await addEntry({ at: at(0), ...legs(4) })
    await openTrends()
    const button = await screen.findByRole('button', { name: 'Riepilogo del diario' })
    await waitFor(() => expect(tile('Cronico')).toBeInTheDocument())
    expect(button.compareDocumentPosition(tile('Cronico')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: '7 giorni' }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('range chips change the data', async () => {
    await addEntry({ at: at(10), ...legs(9) })
    await addEntry({ at: at(0), ...legs(2) })
    await openTrends()
    await waitFor(() => expect(tile('Cronico')).toHaveTextContent('2 voci'))
    await waitFor(() => expect(meanLine()).toHaveTextContent('max 9'))
    await fireEvent.click(screen.getByRole('button', { name: '7 giorni' }))
    expect(screen.getByRole('button', { name: '7 giorni' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(tile('Cronico')).toHaveTextContent('1 voce'))
    expect(meanLine()).toHaveTextContent('max 2')
    // A year of columns: the mean dots would smear, so the legend drops them.
    expect(screen.getByText('media')).toBeInTheDocument()
    await since(364)
    await waitFor(() => expect(screen.queryByText('media')).not.toBeInTheDocument())
  })
})

describe('Trends by any symptom (#38)', () => {
  const picker = () => screen.findByRole('group', { name: 'Sintomo' })
  const swollen = (n: number, swelling: number, pain: number, tags: string[] = []) => addEntry({ at: at(n), layers: [{ regions: ['152'], readings: { pain, swelling }, tags }] })

  it('opens on the first symptom read in range, in the editor\'s order, and every card follows the pick', async () => {
    await swollen(0, 6, 2, ['rest'])
    await swollen(1, 4, 3)
    await openTrends()
    const chips = within(await picker()).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual(['Dolore', 'Gonfiore'])
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(meanLine()).toHaveTextContent('2,5'))
    expect(screen.getByRole('img', { name: 'Dolore per giorno' })).toBeInTheDocument()
    await fireEvent.click(within(await picker()).getByRole('button', { name: 'Gonfiore' }))
    expect(meanLine()).toHaveTextContent('5')
    expect(meanLine()).toHaveTextContent('max 6')
    expect(screen.getByRole('list', { name: 'Giorni per livello peggiore' }).closest('.card')).toHaveTextContent('mediana 5')
    expect(screen.getByRole('img', { name: 'Gonfiore per giorno' })).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('[data-region="152"]')!.getAttribute('style')).toContain(`fill: ${intensityColor(5)}`))
    // The tiles count the whole diary, above the picker; the card under it is the symptom's, named after it (#120).
    const first = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(first(tile('Episodi'), await picker())).toBe(true)
    expect(first(tile('Cronico'), await picker())).toBe(true)
    expect(meanLine().closest('.card')).toContainElement(screen.getByRole('list', { name: 'Giorni per livello peggiore' }))
    // Three questions about the symptom picked (#120): how much and where name it; when names it on its chart, since
    // the folds under the chart do not follow the pick.
    expect([...document.querySelectorAll('.screen > .card > .label')].map((l) => l.textContent)).toEqual(['Quanto (Gonfiore)', 'Dove (Gonfiore)', 'Quando'])
    expect(screen.getByRole('img', { name: 'Gonfiore per giorno' }).closest('.chart')!.querySelector('.legend')).toHaveTextContent(/^Gonfiore:/)
    // The other symptoms are a chip away: no card of their own (the report keeps its table).
    expect(screen.queryByText('Altri sintomi')).toBeNull()
  })

  it('leads with whatever the editor puts first, pain off or moved', async () => {
    await resetDbWith((db) => db.symptoms.update('swelling', { order: -1 }))
    await swollen(0, 6, 2)
    await openTrends()
    expect(within(await picker()).getByRole('button', { name: 'Gonfiore' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(meanLine()).toHaveTextContent('6'))
  })

  it('without a reading in range, leaves out the figures of a symptom but keeps counting entries', async () => {
    await addEntry({ at: at(0), layers: [{ regions: ['152'], readings: {}, tags: [] }] })
    await openTrends()
    await waitFor(() => expect(tile('Cronico')).toHaveTextContent('1 voce'))
    expect(screen.queryByRole('group', { name: 'Sintomo' })).not.toBeInTheDocument()
    expect(screen.queryByText('Media giornaliera')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Giorni per livello peggiore' })).not.toBeInTheDocument()
    expect(screen.queryByText('Quando')).not.toBeInTheDocument()
  })

  it('hands the pick to the report, which names it', async () => {
    await swollen(0, 6, 2)
    await openTrends()
    await fireEvent.click(within(await picker()).getByRole('button', { name: 'Gonfiore' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Riepilogo del diario' }))
    const report = document.querySelector('article.page') as HTMLElement
    expect(within(report).getByRole('heading', { level: 2, name: 'Quanto (Gonfiore)' })).toBeInTheDocument()
    expect(within(report).getByText('Media giornaliera').parentElement!).toHaveTextContent('6')
  })
})

describe('Trends heatmap and chart', () => {
  it('reads the symptom picked: pain first here, the mind lighting up under a mental symptom, read-only', async () => {
    await addEntry({ at: at(0), layers: [{ regions: ['mind'], readings: { fog: 6 } }] })
    await addEntry({ at: at(1), layers: [{ regions: ['152'], readings: { pain: 2 } }] })
    await openTrends()
    const mind = () => document.querySelector('[data-region="mind"]') as SVGPathElement
    await waitFor(() => expect(document.querySelector('[data-region="152"]')).toHaveClass('on'))
    expect(mind()).not.toHaveClass('on')
    const picker = await screen.findByRole('group', { name: 'Sintomo' })
    expect(within(picker).getByRole('button', { name: 'Dolore' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(within(picker).getByRole('button', { name: 'Nebbia mentale' }))
    await waitFor(() => expect(mind().getAttribute('style')).toContain(`fill: ${intensityColor(6)}`))
    expect(mind()).toHaveClass('on')
    expect(mind().getAttribute('style')).not.toContain('fill-opacity')
    expect(document.querySelector('[data-ring="mind"]')!.getAttribute('style')).toContain('stroke-width: 5.00px')
    expect(document.querySelector('[data-region="152"]')).not.toHaveClass('on')
    expect(screen.queryByRole('button', { name: 'Mente' })).not.toBeInTheDocument()
  })

  it('counts full body apart, under the map, instead of lighting every region (#114)', async () => {
    await addEntry({ at: at(0), ...legs(8) })
    await addEntry({ at: at(1), layers: [{ regions: ['*'], readings: { pain: 2 }, tags: [] }] })
    await addEntry({ at: at(2), layers: [{ regions: ['*'], readings: { pain: 5 }, tags: [] }] })
    await openTrends()
    await waitFor(() => expect(document.querySelector('[data-region="152"]')).toHaveClass('on'))
    expect(document.querySelector('[data-region="110"]')).not.toHaveClass('on')
    expect(screen.getByText('Tutto il corpo: 2 volte, media 3,5')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Riepilogo del diario' }))
    const report = document.querySelector('article.page') as HTMLElement
    expect(within(report).getByText('Tutto il corpo: 2 volte, media 3,5')).toBeInTheDocument()
  })

  it('the map has its colour key, and the report its key and caption (#114)', async () => {
    await addEntry({ at: at(0), ...legs(8) })
    await openTrends()
    const map = (await screen.findByText(/^Dove \(/)).closest('.card') as HTMLElement
    expect(within(map).getByRole('img', { name: 'Scala dei colori: da 0 assente a 10 massimo' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Riepilogo del diario' }))
    const report = document.querySelector('article.page') as HTMLElement
    expect(within(report).getByRole('img', { name: 'Scala dei colori: da 0 assente a 10 massimo' })).toBeInTheDocument()
    expect(within(report).getByText('Colore: intensità media. Bordo: frequenza.')).toBeInTheDocument()
  })

  it('says nothing of full body when no entry reads the symptom there', async () => {
    await addEntry({ at: at(0), ...legs(8) })
    await addEntry({ at: at(1), layers: [{ regions: ['*'], readings: { swelling: 4 }, tags: [] }] })
    await openTrends()
    await waitFor(() => expect(document.querySelector('[data-region="152"]')).toHaveClass('on'))
    expect(screen.queryByText(/^Tutto il corpo/)).toBeNull()
    await fireEvent.click(within(await screen.findByRole('group', { name: 'Sintomo' })).getByRole('button', { name: 'Gonfiore' }))
    expect(await screen.findByText('Tutto il corpo: 1 volta, media 4')).toBeInTheDocument()
  })

  it('keeps colour for the mean and draws frequency as a ring inside the region, on a log scale (#23)', async () => {
    for (let n = 0; n < 4; n++) await addEntry({ at: at(n), ...legs(8) })
    await addEntry({ at: at(4), layers: [{ regions: ['153'], readings: { pain: 3 }, tags: [] }] })
    await openTrends()
    await waitFor(() => expect(document.querySelector('[data-region="153"]')).toHaveClass('on'))
    // Fading would shift how intense the colour looks (lighter on a light ground, darker on a dark one): the fill is always whole.
    for (const id of ['152', '153']) expect(document.querySelector(`[data-region="${id}"]`)!.getAttribute('style')).not.toContain('fill-opacity')
    // Seen once of at most four: 0.75 + 1.75 × ln 2 / ln 5 = 1.50px inside, drawn twice as wide and clipped to the region.
    expect(document.querySelector('[data-ring="153"]')!.getAttribute('style')).toContain('stroke-width: 3.01px')
    expect(document.querySelector('[data-ring="152"]')!.getAttribute('style')).toContain('stroke-width: 5.00px')
    expect(document.querySelector('[data-ring="154"]')).toBeNull()
  })

  it('colours the regions that appeared, read-only', async () => {
    await addEntry({ at: at(0), ...legs(8) })
    await openTrends()
    await waitFor(() => expect(document.querySelector('[data-region="152"]')).toHaveClass('on'))
    const thigh = document.querySelector('[data-region="152"]') as SVGPathElement
    expect(thigh.getAttribute('style')).toContain(`fill: ${intensityColor(8)}`)
    expect(thigh.getAttribute('style')).not.toContain('fill-opacity')
    expect(document.querySelector('[data-region="153"]')).not.toHaveClass('on')
    expect(document.querySelector('[data-region="mind"]')).not.toHaveClass('on')
    expect(document.querySelectorAll('path.hit')).toHaveLength(0)
  })

  it('marks a day at 0 on the baseline, on every range, and leaves a day with nothing logged empty', async () => {
    await addEntry({ at: at(0), ...legs(0) })
    await addEntry({ at: at(2), ...legs(5) })
    await openTrends()
    const chart = await screen.findByRole('img', { name: 'Dolore per giorno' })
    await waitFor(() => expect(chart.querySelectorAll('.zero')).toHaveLength(1))
    expect(chart.querySelector('.zero')).toHaveAttribute('fill', intensityColor(0))
    expect(chart.querySelectorAll('path.col')).toHaveLength(1)
    await since(364)
    await waitFor(() => expect(screen.getByRole('img', { name: 'Dolore per giorno' }).querySelectorAll('.zero')).toHaveLength(1))
  })

  it('spaces the dates under the chart so they never run into each other, on every range', async () => {
    // jsdom lays nothing out: give the chart a phone's width.
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(360)
    onTestFinished(() => width.mockRestore())
    await addEntry({ at: at(0), ...legs(3) })
    await openTrends()
    for (const r of ['7 giorni', '30 giorni', '90 giorni', 'a year']) {
      if (r === 'a year') await since(364)
      else await fireEvent.click(screen.getByRole('button', { name: r }))
      const chart = await screen.findByRole('img', { name: 'Dolore per giorno' })
      await waitFor(() => expect(chart.querySelectorAll('text.date').length).toBeGreaterThan(1))
      const xs = Array.from(chart.querySelectorAll('text.date')).map((el) => Number(el.getAttribute('x')))
      const gap = Math.min(...xs.slice(1).map((x, i) => x - xs[i]))
      expect(gap, r).toBeGreaterThanOrEqual(r === '7 giorni' ? 28 : 48)
    }
  })

  it('tapping a day shows its numbers, tapping again hides them', async () => {
    await addEntry({ at: at(0, 9), ...legs(8) })
    await addEntry({ at: at(0, 10), ...legs(4) })
    await openTrends()
    const today = await screen.findByRole('button', { name: fmtFull(daysAgo(0)) })
    await fireEvent.pointerDown(today)
    const tip = document.querySelector('.tip')!
    expect(tip).toHaveTextContent(fmtFull(daysAgo(0)))
    expect(tip).toHaveTextContent('max del giorno 8 · media 6,0 · 2 voci')
    await fireEvent.pointerDown(screen.getByRole('button', { name: fmtFull(daysAgo(1)) }))
    expect(document.querySelector('.tip')).toHaveTextContent('nessuna voce')
    await fireEvent.pointerDown(screen.getByRole('button', { name: fmtFull(daysAgo(1)) }))
    expect(document.querySelector('.tip')).toBeNull()
  })
})

describe('Trends tags and symptoms', () => {
  it("shows each tag on the chart's days, under folds closed each time, a closed fold listing its tags (#120)", async () => {
    for (let n = 0; n < 6; n++) await addEntry({ at: at(n), ...legs(8, { tags: n < 2 ? ['rest', 'stress'] : ['rest'] }) })
    for (let n = 6; n < 12; n++) await addEntry({ at: at(n), ...legs(2) })
    await openTrends()
    const chart = await screen.findByRole('img', { name: 'Dolore per giorno' })
    // One fold per group used, most used first inside, each closed and listing its tags with their days.
    const remedies = await screen.findByRole('button', { name: /^Rimedi \(1\)/ })
    expect(remedies).toHaveAttribute('aria-expanded', 'false')
    expect(remedies).toHaveTextContent(/^Rimedi \(1\)\s*Riposo 6$/)
    expect(screen.getByRole('button', { name: /^Contesto \(1\)/ })).toHaveTextContent(/Stress 2$/)
    expect(screen.queryByRole('button', { name: /^Farmaci/ })).toBeNull()
    expect(document.querySelector('.lane')).toBeNull()
    // Open, the fold names its group alone and shows a row per tag: a mark on each day it was used.
    await fireEvent.click(remedies)
    expect(remedies).toHaveAttribute('aria-expanded', 'true')
    expect(remedies).toHaveTextContent(/^Rimedi \(1\)$/)
    const lane = screen.getByText('Riposo').closest('.lane') as HTMLElement
    expect(lane).toHaveTextContent('6 giorni')
    expect(lane.querySelectorAll('.mark')).toHaveLength(6)
    // The chart's time scale: today's mark is centred on today's column.
    const centre = (el: Element) => Number(el.getAttribute('x')) + Number(el.getAttribute('width')) / 2
    const day = chart.querySelector(`rect.hit[aria-label="${fmtFull(daysAgo(0))}"]`)!
    expect(centre(lane.querySelector(`.mark[data-day="${ymd(daysAgo(0))}"]`)!)).toBeCloseTo(centre(day))
    // Five days a side was noise, and a dose is taken because the pain is high: no comparison (#114, #120), and no tag card.
    expect(chart.closest('.card')).not.toHaveTextContent(/con |senza|descrittivo/)
    expect(screen.queryByText('Tag')).toBeNull()
    // Closed again the next time the screen opens.
    await back()
    await go('Andamento')
    expect(await screen.findByRole('button', { name: /^Rimedi \(1\)/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the tags over time even when nothing in range reads a symptom', async () => {
    await addEntry({ at: at(0), layers: [{ regions: ['152'], readings: {}, tags: ['rest'] }] })
    await openTrends()
    await fireEvent.click(await screen.findByRole('button', { name: /^Rimedi \(1\)/ }))
    expect(screen.getByText('Riposo').closest('.card')).toHaveTextContent('Quando')
    expect(screen.queryByRole('img', { name: /per giorno/ })).toBeNull()
  })

  it('has no tag folds when no tag was used in range', async () => {
    await addEntry({ at: at(0), ...legs(4) })
    await openTrends()
    await waitFor(() => expect(tile('Cronico')).toHaveTextContent('1 voce'))
    expect(screen.queryByRole('button', { name: /^(Farmaci|Rimedi|Contesto)/ })).toBeNull()
  })
})

describe('Trends report', () => {
  it('opens the report and closes it again', async () => {
    await addEntry({ at: at(0), ...legs(5) })
    await openTrends()
    await fireEvent.click(await screen.findByRole('button', { name: 'Riepilogo del diario' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Diario dei sintomi' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('heading', { level: 1, name: 'Diario dei sintomi' })).not.toBeInTheDocument()
  })
})

describe('Trends presets and episodes (#120)', () => {
  /** Quando, with the fold of that name opened: the chronic or episode presets, beside the tags' (#120). */
  async function fold(name: 'Preset cronici' | 'Preset episodici') {
    const button = await screen.findByRole('button', { name: new RegExp(`^${name} \\(`) })
    if (button.getAttribute('aria-expanded') === 'false') await fireEvent.click(button)
    return button.closest('.card') as HTMLElement
  }

  it("draws each chronic preset by day in the Preset cronici fold under the chart, a column at the day's highest reading, its readings counted", async () => {
    const p = await addPreset({ name: 'Schiena', layers: [{ regions: ['224'], asks: ['pain'] }], kind: 'chronic' })
    await logPreset(p, [{ pain: 4 }], at(1))
    await logPreset(p, [{ pain: 6 }], at(0, 9))
    await logPreset(p, [{ pain: 3 }], at(0, 10))
    await openTrends()
    // Closed, the fold lists the presets with their readings, after the chart's and before the tags'.
    const closed = await screen.findByRole('button', { name: /^Preset cronici \(1\)/ })
    expect(closed).toHaveTextContent(/^Preset cronici \(1\)\s*Schiena 3$/)
    const c = await fold('Preset cronici')
    expect(c).toHaveTextContent('Quando')
    expect(c).toHaveTextContent('Schiena3 voci')
    const chart = await within(c).findByRole('img', { name: 'Schiena' })
    await waitFor(() => expect(chart.querySelectorAll('path.col')).toHaveLength(2))
    expect([...chart.querySelectorAll('path.col')].map((col) => col.getAttribute('fill'))).toEqual([intensityColor(4), intensityColor(6)])
    // Compact: no legend, no mean, no dates; the card is the screen's last.
    expect(chart.closest('.chart')!.querySelector('.legend')).toBeNull()
    expect(chart.querySelectorAll('circle.mean, text.date')).toHaveLength(0)
    // On the chart's days: each column starts where the Quando chart's column of that day does.
    const left = (chart: Element) => [...chart.querySelectorAll('path.col')].map((col) => col.getAttribute('d')!.split(' ')[1])
    expect(left(chart)).toEqual(left(within(c).getByRole('img', { name: 'Dolore per giorno' })))
  })

  it("keeps a day without the preset's symptom empty: no column at 0", async () => {
    const p = await addPreset({ name: 'Gonfiore', layers: [{ regions: ['152'], asks: ['swelling'] }], kind: 'chronic' })
    await logPreset(p, [{ swelling: 5 }])
    await addEntry({ at: at(1), presetId: p.id, layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    await openTrends()
    const chart = await within(await fold('Preset cronici')).findByRole('img', { name: 'Gonfiore' })
    await waitFor(() => expect(chart.querySelectorAll('path.col')).toHaveLength(1))
    expect(chart.querySelector('path.col')).toHaveAttribute('fill', intensityColor(5))
    expect(chart.querySelector('.zero')).toBeNull()
  })

  it('draws an episode opened from a preset as one bar over its days, begun before the range, at its latest level while it goes on', async () => {
    const p = await addPreset({ name: 'Emicrania', layers: [{ regions: ['100'], asks: ['pain'] }], kind: 'episode' })
    const head = await logPreset(p, [{ pain: 7 }], at(9))
    await logUpdate(head.id, [{ pain: 5 }], at(3))
    await logUpdate(head.id, [{ pain: 2 }], at(1))
    await openTrends()
    await fireEvent.click(screen.getByRole('button', { name: '7 giorni' }))
    expect(await screen.findByRole('button', { name: /^Preset episodici \(1\)/ })).toHaveTextContent(/Emicrania 1$/)
    const c = await fold('Preset episodici')
    await waitFor(() => expect(c).toHaveTextContent('Emicrania1 episodio'))
    const bar = c.querySelector('rect.ep')!
    expect(bar).toHaveAttribute('data-from', ymd(daysAgo(6)))
    expect(bar).toHaveAttribute('data-to', ymd(daysAgo(0)))
    expect(bar).toHaveAttribute('fill', intensityColor(2))
    // An episode preset has its bars, not a chart of its own.
    expect(within(c).queryByRole('img', { name: 'Emicrania' })).toBeNull()
  })

  it('puts episodes logged by hand last, a multi-day one as one bar at its highest once ended, and counts those begun per week, or per month on a year', async () => {
    await addEntry({ at: at(2, 18), kind: 'episode', endedAt: at(0, 8), ...legs(6) })
    const ep = (await db.entries.toArray())[0]
    await logUpdate(ep.id, [{ pain: 3 }], at(1, 9))
    await openTrends()
    const c = await fold('Preset episodici')
    await waitFor(() => expect(c).toHaveTextContent('Altri episodi1 episodio'))
    const bar = c.querySelector('rect.ep')!
    expect(bar).toHaveAttribute('data-from', ymd(daysAgo(2)))
    expect(bar).toHaveAttribute('data-to', ymd(daysAgo(0)))
    expect(bar).toHaveAttribute('fill', intensityColor(6))
    const weeks = within(c).getByRole('img', { name: 'Episodi iniziati per settimana' })
    expect([...weeks.querySelectorAll('text.n')].map((n) => n.textContent)).toEqual(['0', '0', '0', '1', '0'])
    await since(364)
    await waitFor(() => expect(within(c).getByRole('img', { name: 'Episodi iniziati per mese' })).toBeInTheDocument())
  })

  it('has no preset folds without presets or episodes in range', async () => {
    await addEntry({ at: at(0), ...legs(4) })
    await openTrends()
    await waitFor(() => expect(tile('Cronico')).toHaveTextContent('1 voce'))
    expect(screen.queryByRole('button', { name: /^Preset (cronici|episodici) \(/ })).toBeNull()
  })
})

describe('Trends strokes', () => {
  it('shades every stroke in the range drawn on the current figure over the heatmap', async () => {
    await addEntry({ at: at(0), layers: [{ regions: ['152'], readings: { pain: 8 }, strokes: [{ region: '152', fig: 'female', view: 'front', points: [[180, 300], [184, 330]], w: 8 }] }] })
    await addEntry({ at: at(1), layers: [{ regions: ['261'], readings: { pain: 3 }, strokes: [{ region: '261', fig: 'female', view: 'back', points: [[80, 450]], w: 8 }, { region: '261', fig: 'male', view: 'back', points: [[82, 452]], w: 8 }] }] })
    await addEntry({ at: at(2), ...legs(2) })
    await openTrends()
    await waitFor(() => expect(document.querySelectorAll('.stroke')).toHaveLength(2))
    const front = screen.getByRole('group', { name: 'Davanti' })
    expect(front.querySelectorAll('.stroke')).toHaveLength(1)
    expect(front.querySelector('.stroke')).toHaveAttribute('stroke', intensityColor(8))
    expect(front.querySelector('.strokes')).toHaveClass('heat')
  })
})
