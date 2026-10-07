import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/svelte'
import { prefs } from '../lib/prefs.svelte'
import WorstDays from './WorstDays.svelte'

/** A figure of the row over the bars, by its label: "Mediana" → "4". */
const figure = (k: string) => screen.getByText(k).nextElementSibling!

describe('WorstDays', () => {
  it('scales the bars to the most common level, keeps a hairline for the empty ones, and says what they count under them', () => {
    prefs.lang = 'it'
    render(WorstDays, { worst: [0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0], median: 4, days: 7 })
    const list = screen.getByRole('list', { name: 'Numero di giorni per livello massimo' })
    const bars = within(list).getAllByRole('listitem').map((li) => (li.querySelector('.bar') as HTMLElement).style.height)
    expect(bars[2]).toBe('50%')
    expect(bars[4]).toBe('100%')
    expect(bars[0]).toBe('0%')
    // The caption sits under the bars (#120).
    const caption = screen.getByText('Numero di giorni per livello massimo')
    expect(list.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('leads with four figures over the days at their highest: the lowest, the median, the highest, and how many days read (#120)', () => {
    prefs.lang = 'it'
    render(WorstDays, { worst: [0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0], median: 4, days: 7 })
    expect(figure('Minimo')).toHaveTextContent(/^2$/)
    expect(figure('Mediana')).toHaveTextContent(/^4$/)
    expect(figure('Massimo')).toHaveTextContent(/^4$/)
    expect(figure('Giorni')).toHaveTextContent(/^3\/7$/)
    // Above the bars, in the tiles' layout; no mean anywhere.
    const list = screen.getByRole('list', { name: 'Numero di giorni per livello massimo' })
    expect(figure('Minimo').compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/\bmedia\b/i)).toBeNull()
  })

  it('writes a half-level median as the app writes numbers, and a day at 0 as a minimum of 0', () => {
    prefs.lang = 'it'
    render(WorstDays, { worst: [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], median: 1.5, days: 2 })
    expect(figure('Minimo')).toHaveTextContent(/^0$/)
    expect(figure('Mediana')).toHaveTextContent(/^1,5$/)
    expect(figure('Massimo')).toHaveTextContent(/^3$/)
  })
})
