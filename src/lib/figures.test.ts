import { describe, it, expect } from 'vitest'
import { FIGURES, FIGURE_SIZE } from './figures'

describe('CHOIR figures', () => {
  it('both silhouettes carry the same 36 front and 38 back segment codes', () => {
    const codes = (polys: Record<string, unknown>) => Object.keys(polys).map(Number).sort((a, b) => a - b)
    const front = Array.from({ length: 36 }, (_, i) => 101 + i)
    const back = Array.from({ length: 38 }, (_, i) => 201 + i)
    for (const f of ['female', 'male'] as const) {
      expect(codes(FIGURES[f].front)).toEqual(front)
      expect(codes(FIGURES[f].back)).toEqual(back)
    }
  })

  it('every segment is a closed-able polygon with at least 3 points inside the figure box', () => {
    for (const f of ['female', 'male'] as const) {
      const { w, h } = FIGURE_SIZE[f]
      for (const view of ['front', 'back'] as const) {
        for (const [code, pts] of Object.entries(FIGURES[f][view])) {
          expect(pts.length, `${f} ${view} ${code}`).toBeGreaterThanOrEqual(3)
          for (const [x, y] of pts) {
            expect(x).toBeGreaterThanOrEqual(0)
            expect(y).toBeGreaterThanOrEqual(0)
            expect(x).toBeLessThanOrEqual(w)
            expect(y).toBeLessThanOrEqual(h)
          }
        }
      }
    }
  })

  it('the female abdomen is renumbered to the male codes: 116/117 sit below the chest, 112/113 on the arms', () => {
    const cy = (pts: [number, number][]) => pts.reduce((t, p) => t + p[1], 0) / pts.length
    const cx = (pts: [number, number][]) => pts.reduce((t, p) => t + p[0], 0) / pts.length
    for (const f of ['female', 'male'] as const) {
      const front = FIGURES[f].front
      expect(cy(front['116'])).toBeGreaterThan(cy(front['108']))
      expect(Math.abs(cx(front['116']) - cx(front['117']))).toBeLessThan(60)
      // 112 is an upper arm, far from the midline; before the renumbering it was the female abdomen.
      expect(Math.abs(cx(front['112']) - FIGURE_SIZE[f].w / 2)).toBeGreaterThan(60)
    }
  })
})
