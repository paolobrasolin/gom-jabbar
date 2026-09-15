import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/svelte'
import IntensitySlider from './IntensitySlider.svelte'

/** A 148px wide slider with the 48px thumb: the thumb centre travels from x=24 (0) to x=124 (10). */
function setup(value = 5) {
  const onchange = vi.fn()
  render(IntensitySlider, { label: 'Dolore', value, onchange })
  const input = screen.getByRole('slider', { name: 'Dolore' }) as HTMLInputElement
  input.getBoundingClientRect = () => ({ left: 0, top: 0, width: 148, height: 48, right: 148, bottom: 48, x: 0, y: 0, toJSON() {} })
  const surface = input.parentElement!
  return { input, surface, onchange }
}
const pt = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true })

describe('IntensitySlider gestures', () => {
  it('a horizontal drag moves the value', async () => {
    const { input, surface, onchange } = setup(5)
    await fireEvent.pointerDown(surface, pt(74, 20))
    await fireEvent.pointerMove(window, pt(90, 22))
    await fireEvent.pointerMove(window, pt(114, 23))
    expect(input.value).toBe('9')
    await fireEvent.pointerUp(window, pt(114, 23))
    expect(onchange).toHaveBeenLastCalledWith(9)
  })

  it('a vertical drag leaves the value alone so the page can scroll', async () => {
    const { input, surface, onchange } = setup(5)
    await fireEvent.pointerDown(surface, pt(74, 20))
    await fireEvent.pointerMove(window, pt(76, 40))
    await fireEvent.pointerMove(window, pt(100, 120))
    await fireEvent.pointerCancel(window, pt(100, 120))
    expect(input.value).toBe('5')
    expect(onchange).not.toHaveBeenCalled()
  })

  it('a tap sets the value at the touch point', async () => {
    const { input, surface, onchange } = setup(5)
    await fireEvent.pointerDown(surface, pt(24, 20))
    await fireEvent.pointerUp(window, pt(25, 21))
    expect(input.value).toBe('0')
    expect(onchange).toHaveBeenCalledWith(0)
  })

  it('keyboard and input events still work on the native control', async () => {
    const { input, onchange } = setup(5)
    await fireEvent.input(input, { target: { value: '7' } })
    expect(onchange).toHaveBeenCalledWith(7)
  })
})
