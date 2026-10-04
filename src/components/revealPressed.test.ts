/** Scrolling a row to its pressed chip (#22, #115): the time rows and the layer tabs. */
import { describe, it, expect } from 'vitest'
import { revealPressed } from './TimeChips.svelte'

/** A row 200 wide whose pressed chip spans `chip` in row coordinates, moving as the row scrolls (jsdom has no layout). */
function row(chip: [number, number], scroll = 0) {
  const el = document.createElement('div')
  const pressed = document.createElement('button')
  pressed.setAttribute('aria-pressed', 'true')
  el.append(pressed)
  el.scrollLeft = scroll
  const rect = (l: number, r: number) => ({ left: l, right: r, top: 0, bottom: 0, x: l, y: 0, width: r - l, height: 0, toJSON: () => ({}) }) as DOMRect
  el.getBoundingClientRect = () => rect(0, 200)
  pressed.getBoundingClientRect = () => rect(chip[0] - el.scrollLeft, chip[1] - el.scrollLeft)
  return el
}

describe('revealPressed', () => {
  it('brings a chip off to the right into sight by its right edge, one off to the left by its left', () => {
    const r = row([500, 600])
    revealPressed(r)
    expect(r.scrollLeft).toBe(412)
    const l = row([100, 150], 300)
    revealPressed(l)
    expect(l.scrollLeft).toBe(88)
  })

  it('shows a chip wider than the row from its start, where its words begin', () => {
    const r = row([20, 700])
    revealPressed(r)
    expect(r.scrollLeft).toBe(8)
  })

  it('leaves a chip already in sight where it is', () => {
    const r = row([20, 120], 0)
    revealPressed(r)
    expect(r.scrollLeft).toBe(0)
  })
})
