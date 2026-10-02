import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/svelte'
import { prefs } from '../lib/prefs.svelte'
import WorstDays from './WorstDays.svelte'

describe('WorstDays', () => {
  it('scales the bars to the most common level, keeps a hairline for the empty ones, and says the median', () => {
    prefs.lang = 'it'
    render(WorstDays, { worst: [0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0], median: 4, days: 7 })
    const bars = within(screen.getByRole('list', { name: 'Giorni per livello peggiore' })).getAllByRole('listitem').map((li) => (li.querySelector('.bar') as HTMLElement).style.height)
    expect(bars[2]).toBe('50%')
    expect(bars[4]).toBe('100%')
    expect(bars[0]).toBe('0%')
    expect(screen.getByText('mediana 4 · 3 giorni letti su 7')).toBeInTheDocument()
  })

  it('with no day read says so with a dash, never a 0', () => {
    prefs.lang = 'it'
    render(WorstDays, { worst: Array(11).fill(0), median: null, days: 1 })
    expect(screen.getByText('mediana – · 0 giorni letti su 1')).toBeInTheDocument()
  })
})
