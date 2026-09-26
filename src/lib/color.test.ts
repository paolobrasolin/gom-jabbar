import { describe, it, expect } from 'vitest'
import { intensityColor, intensityInk } from './color'
import { contrast } from '../test/contrast'

describe('intensity ramp', () => {
  it('writes every level 1..10 in an ink that reads on its colour (4.5:1)', () => {
    for (let n = 1; n <= 10; n++) expect(contrast(intensityInk(n), intensityColor(n)), `level ${n}`).toBeGreaterThanOrEqual(4.5)
  })

  it('is neutral at 0 and clamps above 10', () => {
    expect(intensityColor(0)).toBe('var(--c-zero)')
    expect(intensityColor(12)).toBe(intensityColor(10))
  })
})
