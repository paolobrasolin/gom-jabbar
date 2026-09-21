import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addPreset, logPreset } from '../lib/presets'
import { addEntry, endEpisode, type EntryInput } from '../lib/entries'
import { intensityColor } from '../lib/color'
import App from '../App.svelte'

beforeEach(() => {
  resetDb()
  prefs.lang = 'it'
})

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
  await fireEvent.click(screen.getByRole('button', { name: 'Andamento' }))
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
    const ep = await addEntry({ at: at(1, 9), ongoing: true, ...legs(6) })
    await endEpisode(ep.id, at(1, 11))
    await openTrends()
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('3'))
    expect(tile('Voci')).toHaveTextContent('in 2 giorni')
    expect(tile('Dolore medio')).toHaveTextContent('6')
    expect(tile('Dolore medio')).toHaveTextContent('max 8')
    expect(tile('Giorni ≥ 5')).toHaveTextContent('2')
    expect(tile('Episodi')).toHaveTextContent('1')
    expect(tile('Episodi')).toHaveTextContent('durata media 2h')
  })

  it('range chips change the data', async () => {
    await addEntry({ at: at(10), ...legs(9) })
    await addEntry({ at: at(0), ...legs(2) })
    await openTrends()
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('2'))
    expect(tile('Dolore medio')).toHaveTextContent('max 9')
    await fireEvent.click(screen.getByRole('button', { name: '7 giorni' }))
    expect(screen.getByRole('button', { name: '7 giorni' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(tile('Voci')).toHaveTextContent('1'))
    expect(tile('Dolore medio')).toHaveTextContent('max 2')
    // A year of columns: the mean dots would smear, so the legend drops them.
    expect(screen.getByText('media')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '365 giorni' }))
    await waitFor(() => expect(screen.queryByText('media')).not.toBeInTheDocument())
  })
})

describe('Trends heatmap and chart', () => {
  it('reads one symptom at a time: pain by default, the mind lighting up under a mental symptom, read-only', async () => {
    await addEntry({ at: at(0), layers: [{ regions: ['mind'], readings: { fog: 6 } }] })
    await addEntry({ at: at(1), layers: [{ regions: ['*'], readings: { pain: 2 } }] })
    await openTrends()
    const mind = () => document.querySelector('[data-region="mind"]') as SVGPathElement
    await waitFor(() => expect(document.querySelector('[data-region="152"]')).toHaveClass('on'))
    expect(mind()).not.toHaveClass('on')
    const picker = await screen.findByRole('group', { name: 'Sintomo della mappa' })
    expect(within(picker).getByRole('button', { name: 'Dolore' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(within(picker).getByRole('button', { name: 'Nebbia mentale' }))
    await waitFor(() => expect(mind().getAttribute('style')).toContain(`fill: ${intensityColor(6)}`))
    expect(mind()).toHaveClass('on')
    expect(mind().getAttribute('style')).toContain('fill-opacity: 1.00')
    expect(document.querySelector('[data-region="152"]')).not.toHaveClass('on')
    expect(screen.queryByRole('button', { name: 'Mente' })).not.toBeInTheDocument()
  })

  it('colours the regions that appeared, read-only', async () => {
    await addEntry({ at: at(0), ...legs(8) })
    await openTrends()
    await waitFor(() => expect(document.querySelector('[data-region="152"]')).toHaveClass('on'))
    const thigh = document.querySelector('[data-region="152"]') as SVGPathElement
    expect(thigh.getAttribute('style')).toContain(`fill: ${intensityColor(8)}`)
    expect(thigh.getAttribute('style')).toContain('fill-opacity: 1.00')
    expect(document.querySelector('[data-region="153"]')).not.toHaveClass('on')
    expect(document.querySelector('[data-region="mind"]')).not.toHaveClass('on')
    expect(document.querySelectorAll('path.hit')).toHaveLength(0)
  })

  it('tapping a day shows its numbers, tapping again hides them', async () => {
    await addEntry({ at: at(0, 9), ...legs(8) })
    await addEntry({ at: at(0, 10), ...legs(4) })
    await openTrends()
    const today = await screen.findByRole('button', { name: fmtFull(daysAgo(0)) })
    await fireEvent.pointerDown(today)
    const tip = document.querySelector('.tip')!
    expect(tip).toHaveTextContent(fmtFull(daysAgo(0)))
    expect(tip).toHaveTextContent('max del giorno 8 · media 6.0 · 2 voci')
    await fireEvent.pointerDown(screen.getByRole('button', { name: fmtFull(daysAgo(1)) }))
    expect(document.querySelector('.tip')).toHaveTextContent('nessuna voce')
    await fireEvent.pointerDown(screen.getByRole('button', { name: fmtFull(daysAgo(1)) }))
    expect(document.querySelector('.tip')).toBeNull()
  })
})

describe('Trends tags and symptoms', () => {
  it('lists tag counts while a comparison would rest on too few days', async () => {
    for (let n = 0; n < 4; n++) await addEntry({ at: at(n), ...legs(8, { tags: ['rest'] }) })
    for (let n = 4; n < 8; n++) await addEntry({ at: at(n), ...legs(2) })
    await openTrends()
    expect(await screen.findByText('Servono almeno 5 giorni con e 5 senza un tag per confrontarli.')).toBeInTheDocument()
    expect(await screen.findByText('Riposo · 4')).toBeInTheDocument()
    expect(screen.queryByText('giorni con')).not.toBeInTheDocument()
  })

  it('compares days with and without a tag once both sides have 5 days', async () => {
    for (let n = 0; n < 5; n++) await addEntry({ at: at(n), ...legs(8, { tags: ['rest'] }) })
    for (let n = 5; n < 10; n++) await addEntry({ at: at(n), ...legs(2) })
    await openTrends()
    const card = (await screen.findByText('giorni con')).closest('.card')!
    expect(card).toHaveTextContent('Riposo (5/5 giorni)')
    const bars = Array.from(card.querySelectorAll('.bar')).map((b) => b.getAttribute('style'))
    expect(bars).toEqual(['width: 80%;', 'width: 20%;'])
    expect(Array.from(card.querySelectorAll('.val')).map((v) => v.textContent)).toEqual(['8.0', '2.0'])
    expect(card).toHaveTextContent('Solo descrittivo')
  })

  it('shows the mean of every other symptom that was recorded', async () => {
    await addEntry({ at: at(0), readings: { pain: 3, swelling: 4 } })
    await addEntry({ at: at(1), readings: { pain: 5, swelling: 6, fatigue: 0 } })
    await openTrends()
    const card = (await screen.findByText('Altri sintomi')).closest('.card')!
    await waitFor(() => expect(card).toHaveTextContent('Gonfiore'))
    expect(card).toHaveTextContent('2 voci')
    expect(within(card as HTMLElement).getByText('5')).toBeInTheDocument()
    expect(card).not.toHaveTextContent('Stanchezza')
  })
})

describe('Trends report', () => {
  it('opens the report and closes it again', async () => {
    await addEntry({ at: at(0), ...legs(5) })
    await openTrends()
    await fireEvent.click(await screen.findByRole('button', { name: 'Report per il medico' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Diario del dolore' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
})

describe('Trends presets', () => {
  it('draws one line per preset with samples in range', async () => {
    const p = await addPreset({ name: 'Schiena', layers: [{ regions: ['224'], readings: { pain: 5 }, tags: [] }], symptomIds: ['pain'], ongoing: false })
    await logPreset(p, { pain: 4 })
    await logPreset(p, { pain: 6 })
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Andamento' }))
    const card = (await screen.findByText('Per preset')).closest('.card')!
    expect(card).toHaveTextContent('Schiena')
    expect(card.querySelectorAll('circle')).toHaveLength(2)
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
