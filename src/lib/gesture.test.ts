import { describe, it, expect, vi } from 'vitest'
import { StageGesture, SWIPE } from './gesture.svelte'

const stage = () => ({ size: { w: 300, h: 320 }, box: { w: 100, h: 100 }, kRange: [1, 8] as [number, number] })

function make() {
  const onStroke = vi.fn()
  const onSwipe = vi.fn()
  const g = new StageGesture(stage, { stroke: onStroke, swipe: onSwipe })
  g.camera = { k: 2, tx: 10, ty: 20 }
  return { g, onStroke, onSwipe }
}

describe('StageGesture', () => {
  it('a painting finger paints in figure coordinates, skipping moves shorter than a unit, and a tap is a dot', () => {
    const { g, onStroke, onSwipe } = make()
    g.down(1, 10, 20, { paint: true })
    expect(g.stroke).toEqual([[0, 0]])
    g.move(1, 11, 20) // half a figure unit: dropped
    g.move(1, 30, 40)
    expect(g.stroke).toEqual([[0, 0], [10, 10]])
    expect(g.up(1)).toBe('stroke')
    expect(onStroke).toHaveBeenCalledWith([[0, 0], [10, 10]])
    expect(g.stroke).toBeNull()
    g.down(1, 50, 60, { paint: true })
    g.up(1)
    expect(onStroke).toHaveBeenLastCalledWith([[20, 20]])
    // A move of an unknown pointer is ignored, and a lift of one concludes nothing.
    g.move(9, 0, 0)
    expect(g.stroke).toBeNull()
    expect(g.up(9)).toBe('none')
    // A long horizontal stroke is paint, never a swipe.
    g.down(1, 10, 20, { paint: true })
    g.move(1, 200, 22)
    expect(g.up(1)).toBe('stroke')
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('a finger that does not paint swipes when it moves far and flat, else it is a tap', () => {
    const { g, onStroke, onSwipe } = make()
    g.down(1, 100, 100)
    expect(g.stroke).toBeNull()
    g.move(1, 100 - SWIPE, 110)
    expect(g.up(1)).toBe('swipe')
    expect(onSwipe).toHaveBeenCalledWith(-SWIPE)
    g.down(1, 100, 100)
    g.move(1, 100 + SWIPE + 5, 90)
    expect(g.up(1)).toBe('swipe')
    expect(onSwipe).toHaveBeenLastCalledWith(SWIPE + 5)
    // Too short, or too steep: a tap, left to the click that follows.
    g.down(1, 100, 100)
    g.move(1, 100 + SWIPE - 1, 100)
    expect(g.up(1)).toBe('tap')
    g.down(1, 100, 100)
    g.move(1, 100 + SWIPE + 10, 100 + SWIPE)
    expect(g.up(1)).toBe('tap')
    g.down(1, 100, 100)
    expect(g.up(1)).toBe('tap')
    expect(onSwipe).toHaveBeenCalledTimes(2)
    expect(onStroke).not.toHaveBeenCalled()
    expect(g.camera).toEqual({ k: 2, tx: 10, ty: 20 })
  })

  it('a second finger cancels the stroke or the swipe, the pair pans and pinches, and nothing paints until every finger is up', () => {
    const { g, onStroke, onSwipe } = make()
    g.down(1, 100, 100, { paint: true })
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
    expect(g.up(3)).toBe('none')
    const cam4 = { ...g.camera }
    g.move(1, 0, 0)
    expect(g.camera).toEqual(cam4)
    g.up(2)
    // One finger left after a pinch: dead, no stroke, no pan, no swipe.
    const cam = { ...g.camera }
    g.move(1, 130, 140)
    expect(g.up(1)).toBe('none')
    expect(g.camera).toEqual(cam)
    expect(onStroke).not.toHaveBeenCalled()
    // Every finger up: painting works again.
    g.down(1, 100, 100, { paint: true })
    g.up(1)
    expect(onStroke).toHaveBeenCalledTimes(1)
    // A swipe candidate joined by a second finger is a pinch, not a swipe.
    g.down(1, 100, 100)
    g.move(1, 100 + SWIPE, 100)
    g.down(2, 200, 100)
    g.up(1)
    expect(g.up(2)).toBe('none')
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('a secondary button drags without painting, within the clamp', () => {
    const { g, onStroke, onSwipe } = make()
    g.down(1, 100, 100, { drag: true, paint: true })
    g.move(1, 130, 90)
    expect(g.camera).toEqual({ k: 2, tx: 40, ty: 10 })
    g.move(1, 1000, 1000)
    // The figure (200×200 at this scale) may leave at most the margin of air.
    expect(g.camera).toEqual({ k: 2, tx: 100 + 40, ty: 120 + 40 })
    expect(g.up(1)).toBe('none')
    expect(onStroke).not.toHaveBeenCalled()
    expect(onSwipe).not.toHaveBeenCalled()
  })
})
