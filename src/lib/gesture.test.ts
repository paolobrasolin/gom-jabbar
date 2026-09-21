import { describe, it, expect, vi } from 'vitest'
import { PaintGesture } from './gesture.svelte'

const stage = () => ({ size: { w: 300, h: 320 }, box: { w: 100, h: 100 }, kRange: [1, 8] as [number, number] })

function make() {
  const onStroke = vi.fn()
  const g = new PaintGesture(stage, onStroke)
  g.camera = { k: 2, tx: 10, ty: 20 }
  return { g, onStroke }
}

describe('PaintGesture', () => {
  it('one finger paints in figure coordinates, skipping moves shorter than a unit, and a tap is a dot', () => {
    const { g, onStroke } = make()
    g.down(1, 10, 20)
    expect(g.stroke).toEqual([[0, 0]])
    g.move(1, 11, 20) // half a figure unit: dropped
    g.move(1, 30, 40)
    expect(g.stroke).toEqual([[0, 0], [10, 10]])
    g.up(1)
    expect(onStroke).toHaveBeenCalledWith([[0, 0], [10, 10]])
    expect(g.stroke).toBeNull()
    g.down(1, 50, 60)
    g.up(1)
    expect(onStroke).toHaveBeenLastCalledWith([[20, 20]])
    // A move of an unknown pointer is ignored.
    g.move(9, 0, 0)
    expect(g.stroke).toBeNull()
  })

  it('a second finger cancels the stroke, the pair pans and pinches, and nothing paints until every finger is up', () => {
    const { g, onStroke } = make()
    g.down(1, 100, 100)
    g.move(1, 105, 100)
    g.down(2, 140, 100)
    expect(g.stroke).toBeNull()
    g.move(1, 125, 130)
    g.move(2, 160, 130)
    expect(g.camera).toEqual({ k: 2, tx: 30, ty: 50 })
    // Spreading doubles the scale around the midpoint.
    g.move(2, 195, 130)
    expect(g.camera.k).toBeCloseTo(4, 5)
    // A third finger freezes the pair; when it lifts, the pinch resumes from where the two are.
    g.down(3, 0, 0)
    g.move(3, 10, 10)
    g.move(1, 0, 0)
    expect(g.camera.k).toBeCloseTo(4, 5)
    g.up(3)
    const cam4 = { ...g.camera }
    g.move(1, 0, 0)
    expect(g.camera).toEqual(cam4)
    g.up(2)
    // One finger left after a pinch: dead, no stroke, no pan.
    const cam = { ...g.camera }
    g.move(1, 130, 140)
    g.up(1)
    expect(g.camera).toEqual(cam)
    expect(onStroke).not.toHaveBeenCalled()
    // Every finger up: painting works again.
    g.down(1, 100, 100)
    g.up(1)
    expect(onStroke).toHaveBeenCalledTimes(1)
  })

  it('a secondary button drags without painting, within the clamp', () => {
    const { g, onStroke } = make()
    g.down(1, 100, 100, true)
    g.move(1, 130, 90)
    expect(g.camera).toEqual({ k: 2, tx: 40, ty: 10 })
    g.move(1, 1000, 1000)
    // The figure (200×200 at this scale) may leave at most the margin of air.
    expect(g.camera).toEqual({ k: 2, tx: 100 + 40, ty: 120 + 40 })
    g.up(1)
    expect(onStroke).not.toHaveBeenCalled()
  })
})
