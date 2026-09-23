import { describe, it, expect } from 'vitest'
import { fitScale, clampCamera, lookAt, toFigure, pinchCamera, zoomAt, MARGIN } from './camera'

const stage = { w: 300, h: 320 }
const box = { w: 100, h: 200 }

describe('camera', () => {
  it('fits the figure to the stage on its tighter axis', () => {
    expect(fitScale(stage, box)).toBe(1.6)
    expect(fitScale({ w: 100, h: 1000 }, box)).toBe(1)
  })

  it('lookAt puts the centre in the middle of the stage and toFigure inverts it', () => {
    const cam = lookAt(stage, 2, { x: 50, y: 100 })
    expect(cam).toEqual({ k: 2, tx: 50, ty: -40 })
    expect(toFigure(cam, 150, 160)).toEqual([50, 100])
    expect(toFigure({ k: 2, tx: -50, ty: -100 }, 150, 200)).toEqual([100, 150])
  })

  it('clampCamera lets a small figure float within the margin and a big one overflow up to it', () => {
    // Small figure (k 1): it may sit anywhere from -MARGIN to the far edge + MARGIN.
    expect(clampCamera(stage, box, { k: 1, tx: -100, ty: 500 })).toEqual({ k: 1, tx: -MARGIN, ty: 120 + MARGIN })
    expect(clampCamera(stage, box, { k: 1, tx: 10, ty: 10 })).toEqual({ k: 1, tx: 10, ty: 10 })
    // Big figure (k 4, 400×800): it may leave at most MARGIN of air on each side.
    expect(clampCamera(stage, box, { k: 4, tx: 100, ty: 100 })).toEqual({ k: 4, tx: MARGIN, ty: MARGIN })
    expect(clampCamera(stage, box, { k: 4, tx: -500, ty: -900 })).toEqual({ k: 4, tx: -100 - MARGIN, ty: -480 - MARGIN })
  })

  it('pinchCamera scales with the spread, keeps the point under the fingers, and clamps the scale', () => {
    const start = { camera: { k: 2, tx: 0, ty: 0 }, mid: { x: 100, y: 100 }, dist: 50 }
    // Same spread, moved: a pan.
    expect(pinchCamera(start, { x: 130, y: 110 }, 50, [1, 8])).toEqual({ k: 2, tx: 30, ty: 10 })
    // Double spread: zoom ×2 around the figure point (50, 50), which stays under the midpoint.
    const z = pinchCamera(start, { x: 100, y: 100 }, 100, [1, 8])
    expect(z).toEqual({ k: 4, tx: -100, ty: -100 })
    expect(toFigure(z, 100, 100)).toEqual([50, 50])
    // Beyond the range the scale stops but the pan goes on.
    expect(pinchCamera(start, { x: 100, y: 100 }, 1000, [1, 3]).k).toBe(3)
    // A single finger (no distance) only drags.
    expect(pinchCamera({ ...start, dist: 0 }, { x: 120, y: 100 }, 0, [1, 8])).toEqual({ k: 2, tx: 20, ty: 0 })
  })

  it('zoomAt scales about the middle of the stage, within the range, and keeps the figure on the stage', () => {
    const stage = { w: 300, h: 320 }
    const box = { w: 100, h: 100 }
    const cam = { k: 2, tx: 50, ty: 60 }
    const z = zoomAt(stage, box, cam, 2, [1, 8])
    expect(z.k).toBe(4)
    // The figure point that was in the middle of the stage is still there.
    expect(toFigure(z, 150, 160)).toEqual(toFigure(cam, 150, 160))
    expect(zoomAt(stage, box, cam, 10, [1, 6]).k).toBe(6)
    // Zooming out past the fit is clamped, and the figure floats within the margin.
    const out = zoomAt(stage, box, cam, 0.1, [1, 8])
    expect(out.k).toBe(1)
    expect(out.tx).toBeLessThanOrEqual(200 + MARGIN)
    expect(out.tx).toBeGreaterThanOrEqual(-MARGIN)
  })
})
