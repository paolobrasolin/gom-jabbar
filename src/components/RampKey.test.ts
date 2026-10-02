/** The colour key of the map (#114): the intensity ramp from 0 to 10, each step in its colour with its number. */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/svelte'
import { prefs } from '../lib/prefs.svelte'
import { intensityColor, intensityInk } from '../lib/color'
import RampKey from './RampKey.svelte'

describe('RampKey', () => {
  it('draws every level from 0 to 10 in its colour, its number in the ink that reads on it', () => {
    prefs.lang = 'it'
    render(RampKey)
    const key = screen.getByRole('img', { name: 'Scala dei colori: da 0 a 10' })
    const steps = within(key).getAllByText(/^\d+$/)
    expect(steps.map((s) => s.textContent)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
    // The DOM writes colours its own way: compare with the same colours written through it.
    const probe = document.createElement('span')
    steps.forEach((s, i) => {
      probe.style.background = intensityColor(i)
      probe.style.color = intensityInk(i)
      expect(s.style.background).toBe(probe.style.background)
      expect(s.style.color).toBe(probe.style.color)
    })
  })
})
