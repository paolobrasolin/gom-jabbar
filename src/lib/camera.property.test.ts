/** The stage's camera for any stage, figure, pinch and zoom (#91): camera.ts is pure maths, so its rules can be stated whole. */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { fitScale, clampCamera, lookAt, toFigure, pinchCamera, zoomAt, MAX_ZOOM, type Camera } from './camera'

const size = fc.record({ w: fc.integer({ min: 100, max: 1200 }), h: fc.integer({ min: 100, max: 1200 }) })
const box = fc.record({ w: fc.integer({ min: 200, max: 300 }), h: fc.integer({ min: 500, max: 600 }) })
const point = fc.record({ x: fc.double({ min: -500, max: 1500, noNaN: true }), y: fc.double({ min: -500, max: 1500, noNaN: true }) })
const camera: fc.Arbitrary<Camera> = fc.record({ k: fc.double({ min: 0.2, max: 12, noNaN: true }), tx: fc.double({ min: -3000, max: 3000, noNaN: true }), ty: fc.double({ min: -3000, max: 3000, noNaN: true }) })
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6 * Math.max(1, Math.abs(a), Math.abs(b)))

describe('the camera, for any stage and gesture (#91)', () => {
  it('fitted, the figure fills the stage on one side and stays inside on the other', () => {
    fc.assert(
      fc.property(size, box, (stage, b) => {
        const k = fitScale(stage, b)
        expect(k * b.w).toBeLessThanOrEqual(stage.w + 1e-9)
        expect(k * b.h).toBeLessThanOrEqual(stage.h + 1e-9)
        expect(Math.min(stage.w - k * b.w, stage.h - k * b.h)).toBeLessThan(1e-6)
      }),
    )
  })

  it('looking at a point puts it in the middle of the stage', () => {
    fc.assert(
      fc.property(size, fc.double({ min: 0.2, max: 12, noNaN: true }), point, (stage, k, p) => {
        const [x, y] = toFigure(lookAt(stage, k, p), stage.w / 2, stage.h / 2)
        close(x, p.x)
        close(y, p.y)
      }),
    )
  })

  it('a pinch keeps the figure point under the fingers under them, at a scale within its range', () => {
    fc.assert(
      fc.property(camera, point, point, fc.double({ min: 1, max: 400, noNaN: true }), fc.double({ min: 1, max: 400, noNaN: true }), (cam, from, to, d0, d1) => {
        const range: [number, number] = [0.3, 0.3 * MAX_ZOOM]
        const next = pinchCamera({ camera: cam, mid: from, dist: d0 }, to, d1, range)
        expect(next.k).toBeGreaterThanOrEqual(range[0])
        expect(next.k).toBeLessThanOrEqual(range[1])
        const [ax, ay] = toFigure(cam, from.x, from.y)
        const [bx, by] = toFigure(next, to.x, to.y)
        close(ax, bx)
        close(ay, by)
      }),
    )
  })

  it('keeping the figure on the stage keeps the scale, and doing it twice changes nothing', () => {
    fc.assert(
      fc.property(size, box, camera, (stage, b, cam) => {
        const once = clampCamera(stage, b, cam)
        expect(once.k).toBe(cam.k)
        expect(clampCamera(stage, b, once)).toEqual(once)
      }),
    )
  })

  it('a zoom stays within its range and leaves the figure on the stage', () => {
    fc.assert(
      fc.property(size, box, camera, fc.constantFrom(1.5, 1 / 1.5), (stage, b, cam, f) => {
        const fit = fitScale(stage, b)
        const range: [number, number] = [fit, fit * MAX_ZOOM]
        const next = zoomAt(stage, b, cam, f, range)
        expect(next.k).toBeGreaterThanOrEqual(range[0])
        expect(next.k).toBeLessThanOrEqual(range[1])
        expect(clampCamera(stage, b, next)).toEqual(next)
      }),
    )
  })
})
