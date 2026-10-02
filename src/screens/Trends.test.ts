import { describe, it, expect, beforeEach, vi, onTestFinished } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addPreset, logPreset } from '../lib/presets'
import { addEntry, endEpisode, logUpdate, type EntryInput } from '../lib/entries'
import { intensityColor } from '../lib/color'
import { go } from '../test/nav'
import App from '../App.svelte'
import { loadAppCss } from '../test/css'
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

describe('Trends summary', () => {
  it('says so when the range is empty, with the 30-day range selected', async () => {
    await openTrends()
    expect(await screen.findByText('Nessuna voce in questo periodo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30 giorni' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '7 giorni' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Report per il medico' })).not.toBeInTheDocument()
  })

  it('fills the tiles from the entries in range', async () => {
    await addEntry({ at: at(0, 9), ...legs(8) })
    await addEntry({ at: at(0, 10), ...legs(4) })
    const ep = await addEntry({ at: at(1, 9), kind: 'episode', ...legs(6) })
    await endEpisode(ep.id, at(1, 11))
    await openTrends()
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('3'))
    expect(tile('Voci')).toHaveTextContent('in 2 giorni')
    expect(tile('Media giornaliera')).toHaveTextContent('6')
    expect(tile('Media giornaliera')).toHaveTextContent('max 8')
    // Each day at its worst (#114): 8 today, 6 yesterday.
    const days = screen.getByRole('list', { name: 'Giorni per livello peggiore' })
    expect(within(days).getAllByRole('listitem').map((b) => b.getAttribute('aria-label'))).toEqual(['0: 0 giorni', '1: 0 giorni', '2: 0 giorni', '3: 0 giorni', '4: 0 giorni', '5: 0 giorni', '6: 1 giorno', '7: 0 giorni', '8: 1 giorno', '9: 0 giorni', '10: 0 giorni'])
    expect(days.closest('.card')).toHaveTextContent('mediana 7 · 2 giorni letti su 30')
    expect(screen.queryByText('Giorni ≥ 5')).toBeNull()
    expect(tile('Episodi')).toHaveTextContent('1')
    expect(tile('Episodi')).toHaveTextContent('durata mediana 2h')
    // One begun and not ended: counted apart, not as a length.
    await addEntry({ at: at(0, 8), kind: 'episode', ...legs(5) })
    await waitFor(() => expect(tile('Episodi')).toHaveTextContent('durata mediana 2h · 1 in corso'))
    expect(tile('Episodi')).toHaveTextContent('2')
  })

  it('an entry dated after today is not in any range, as on the chart (#114)', async () => {
    await addEntry({ at: at(0), ...legs(3) })
    // A clock set wrong, a backup from a phone ahead in time: it is not part of the last 30 days.
    await addEntry({ at: at(-2), ...legs(9, { tags: ['rest'] }) })
    await openTrends()
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('1'))
    expect(tile('Media giornaliera')).toHaveTextContent('max 3')
    expect(screen.queryByText('Riposo')).toBeNull()
  })

  it('Dal… picks the first day: the range runs from it to today, and the report covers the same days (#114)', async () => {
    await addEntry({ at: at(12), ...legs(9) })
    await addEntry({ at: at(3), ...legs(2) })
    await addEntry({ at: at(0), ...legs(4) })
    await openTrends()
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('3'))
    await fireEvent.click(screen.getByRole('button', { name: 'Dal…' }))
    const field = screen.getByLabelText('Dal giorno') as HTMLInputElement
    const day = daysAgo(5)
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    // No day after today: the range ends today.
    const today = daysAgo(0)
    expect(field.max).toBe(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
    await fireEvent.change(field, { target: { value: ymd } })
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('2'))
    expect(tile('Media giornaliera')).toHaveTextContent('max 4')
    const chip = screen.getByRole('button', { name: `Dal ${new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' }).format(day)}` })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '30 giorni' })).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(screen.getByRole('button', { name: 'Report per il medico' }))
    const fmt = (d: Date) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
    expect(screen.getByText(new RegExp(`^Dal ${fmt(day)} al ${fmt(daysAgo(0))}`))).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    // A fixed range again: the picked day is let go.
    await fireEvent.click(screen.getByRole('button', { name: '30 giorni' }))
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('3'))
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
    const button = await screen.findByRole('button', { name: 'Report per il medico' })
    await waitFor(() => expect(tile('Voci')).toBeInTheDocument())
    expect(button.compareDocumentPosition(tile('Voci')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: '7 giorni' }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('range chips change the data', async () => {
    await addEntry({ at: at(10), ...legs(9) })
    await addEntry({ at: at(0), ...legs(2) })
    await openTrends()
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('2'))
    expect(tile('Media giornaliera')).toHaveTextContent('max 9')
    await fireEvent.click(screen.getByRole('button', { name: '7 giorni' }))
    expect(screen.getByRole('button', { name: '7 giorni' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('1'))
    expect(tile('Media giornaliera')).toHaveTextContent('max 2')
    // A year of columns: the mean dots would smear, so the legend drops them.
    expect(screen.getByText('media')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '365 giorni' }))
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
    await waitFor(() => expect(tile('Media giornaliera')).toHaveTextContent('2,5'))
    expect(screen.getByRole('img', { name: 'Dolore per giorno' })).toBeInTheDocument()
    await fireEvent.click(within(await picker()).getByRole('button', { name: 'Gonfiore' }))
    expect(tile('Media giornaliera')).toHaveTextContent('5')
    expect(tile('Media giornaliera')).toHaveTextContent('max 6')
    expect(screen.getByRole('list', { name: 'Giorni per livello peggiore' }).closest('.card')).toHaveTextContent('mediana 5')
    expect(screen.getByRole('img', { name: 'Gonfiore per giorno' })).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('[data-region="152"]')!.getAttribute('style')).toContain(`fill: ${intensityColor(5)}`))
    // Altri sintomi: the others, pain among them.
    const others = screen.getByText('Altri sintomi').closest('.card')!
    expect(others).toHaveTextContent('Dolore')
    expect(others).not.toHaveTextContent('Gonfiore')
  })

  it('leads with whatever the editor puts first, pain off or moved', async () => {
    await resetDbWith((db) => db.symptoms.update('swelling', { order: -1 }))
    await swollen(0, 6, 2)
    await openTrends()
    expect(within(await picker()).getByRole('button', { name: 'Gonfiore' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(tile('Media giornaliera')).toHaveTextContent('6'))
  })

  it('without a reading in range, leaves out the figures of a symptom but keeps counting entries', async () => {
    await addEntry({ at: at(0), layers: [{ regions: ['152'], readings: {}, tags: [] }] })
    await openTrends()
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('1'))
    expect(screen.queryByRole('group', { name: 'Sintomo' })).not.toBeInTheDocument()
    expect(screen.queryByText('Media giornaliera')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Giorni per livello peggiore' })).not.toBeInTheDocument()
    expect(screen.queryByText('Nel tempo')).not.toBeInTheDocument()
  })

  it('hands the pick to the report, which names it', async () => {
    await swollen(0, 6, 2)
    await openTrends()
    await fireEvent.click(within(await picker()).getByRole('button', { name: 'Gonfiore' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Report per il medico' }))
    const report = document.querySelector('article.page') as HTMLElement
    expect(within(report).getByText('Sintomo: Gonfiore')).toBeInTheDocument()
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
    await fireEvent.click(screen.getByRole('button', { name: 'Report per il medico' }))
    const report = document.querySelector('article.page') as HTMLElement
    expect(within(report).getByText('Tutto il corpo: 2 volte, media 3,5')).toBeInTheDocument()
  })

  it('the map has its colour key, and the report its key and caption (#114)', async () => {
    await addEntry({ at: at(0), ...legs(8) })
    await openTrends()
    const map = (await screen.findByText('Dove')).closest('.card') as HTMLElement
    expect(within(map).getByRole('img', { name: 'Scala dei colori: da 0 assente a 10 massimo' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Report per il medico' }))
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
    await fireEvent.click(screen.getByRole('button', { name: '365 giorni' }))
    await waitFor(() => expect(screen.getByRole('img', { name: 'Dolore per giorno' }).querySelectorAll('.zero')).toHaveLength(1))
  })

  it('spaces the dates under the chart so they never run into each other, on every range', async () => {
    // jsdom lays nothing out: give the chart a phone's width.
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(360)
    onTestFinished(() => width.mockRestore())
    await addEntry({ at: at(0), ...legs(3) })
    await openTrends()
    for (const r of ['7 giorni', '30 giorni', '90 giorni', '365 giorni']) {
      await fireEvent.click(screen.getByRole('button', { name: r }))
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
  it('shows tag use in days, most used first within its group, and never compares days with and without (#114, #120)', async () => {
    for (let n = 0; n < 6; n++) await addEntry({ at: at(n), ...legs(8, { tags: n < 2 ? ['rest', 'stress'] : ['rest'] }) })
    for (let n = 6; n < 12; n++) await addEntry({ at: at(n), ...legs(2) })
    await openTrends()
    const card = (await screen.findByText('Riposo · 6 giorni')).closest('.card') as HTMLElement
    expect([...card.querySelectorAll('.chip')].map((c) => c.textContent)).toEqual(['Riposo · 6 giorni', 'Stress · 2 giorni'])
    // Five days a side was noise, and a dose is taken because the pain is high: the comparison is gone (#120).
    expect(card).not.toHaveTextContent(/con|senza|descrittivo/)
    expect(card.querySelector('.bar')).toBeNull()
  })

  it('has no tag card when no tag was used in range', async () => {
    await addEntry({ at: at(0), ...legs(4) })
    await openTrends()
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('1'))
    expect(screen.queryByText('Tag')).toBeNull()
  })

  it('shows the mean of every other symptom that was recorded, at 0 too (#114)', async () => {
    await addEntry({ at: at(0), readings: { pain: 3, swelling: 4 } })
    await addEntry({ at: at(1), readings: { pain: 5, swelling: 6, fatigue: 0 } })
    await openTrends()
    const card = (await screen.findByText('Altri sintomi')).closest('.card')!
    await waitFor(() => expect(card).toHaveTextContent('Gonfiore'))
    expect(card).toHaveTextContent('2 giorni')
    expect(within(card as HTMLElement).getByText('5')).toBeInTheDocument()
    // Recorded at 0 is recorded: its mean is 0, as the tile would say with Stanchezza picked.
    expect(card).toHaveTextContent('Stanchezza')
    expect(card).toHaveTextContent('1 giorno')
  })
})

describe('Trends report', () => {
  it('opens the report and closes it again', async () => {
    await addEntry({ at: at(0), ...legs(5) })
    await openTrends()
    await fireEvent.click(await screen.findByRole('button', { name: 'Report per il medico' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Diario dei sintomi' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('heading', { level: 1, name: 'Diario dei sintomi' })).not.toBeInTheDocument()
  })
})

describe('Trends presets', () => {
  it('draws one line per preset with samples in range', async () => {
    const p = await addPreset({ name: 'Schiena', layers: [{ regions: ['224'], asks: ['pain'] }], kind: 'chronic' })
    await logPreset(p, [{ pain: 4 }])
    await logPreset(p, [{ pain: 6 }])
    render(App)
    await go('Andamento')
    const card = (await screen.findByText('Per preset')).closest('.card')!
    expect(card).toHaveTextContent('Schiena')
    expect(card.querySelectorAll('circle')).toHaveLength(2)
  })

  it('keeps a preset line empty of readings it lacks: no dot at 0', async () => {
    const p = await addPreset({ name: 'Gonfiore', layers: [{ regions: ['152'], asks: ['swelling'] }], kind: 'chronic' })
    await logPreset(p, [{ swelling: 5 }])
    await addEntry({ at: at(1), presetId: p.id, layers: [{ regions: ['152'], readings: { pain: 4 } }] })
    render(App)
    await go('Andamento')
    const card = (await screen.findByText('Per preset')).closest('.card')!
    await waitFor(() => expect(card.querySelectorAll('circle')).toHaveLength(1))
    expect(card.querySelector('circle')).toHaveAttribute('fill', intensityColor(5))
  })

  it("counts an episode's updates in range when the episode, opened from a preset, began before it", async () => {
    const p = await addPreset({ name: 'Emicrania', layers: [{ regions: ['100'], asks: ['pain'] }], kind: 'episode' })
    const head = await logPreset(p, [{ pain: 7 }], at(9))
    await logUpdate(head.id, [{ pain: 5 }], at(3))
    await logUpdate(head.id, [{ pain: 2 }], at(1))
    render(App)
    await go('Andamento')
    await fireEvent.click(await screen.findByRole('button', { name: '7 giorni' }))
    const card = (await screen.findByText('Per preset')).closest('.card')!
    expect(card).toHaveTextContent('Emicrania')
    await waitFor(() => expect(card.querySelectorAll('circle')).toHaveLength(2))
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
