import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/svelte'
import IntensitySlider from './IntensitySlider.svelte'

/** A 136px wide slider with the 36px thumb: the thumb centre travels from x=18 (0) to x=118 (10). */
function setup(value = 5) {
  const onchange = vi.fn()
  render(IntensitySlider, { label: 'Dolore', value, onchange })
  const input = screen.getByRole('slider', { name: 'Dolore' }) as HTMLInputElement
  input.getBoundingClientRect = () => ({ left: 0, top: 0, width: 136, height: 36, right: 136, bottom: 36, x: 0, y: 0, toJSON() {} })
  const surface = input.parentElement!
  return { input, surface, onchange }
}
const pt = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true })

describe('IntensitySlider gestures', () => {
  it('a horizontal drag moves the value', async () => {
    const { input, surface, onchange } = setup(5)
    await fireEvent.pointerDown(surface, pt(68, 20))
    await fireEvent.pointerMove(window, pt(84, 22))
    await fireEvent.pointerMove(window, pt(108, 23))
    expect(input.value).toBe('9')
    await fireEvent.pointerUp(window, pt(108, 23))
    expect(onchange).toHaveBeenLastCalledWith(9)
  })

  it('a vertical drag leaves the value alone so the page can scroll', async () => {
    const { input, surface, onchange } = setup(5)
    await fireEvent.pointerDown(surface, pt(68, 20))
    await fireEvent.pointerMove(window, pt(70, 40))
    await fireEvent.pointerMove(window, pt(94, 120))
    await fireEvent.pointerCancel(window, pt(94, 120))
    expect(input.value).toBe('5')
    expect(onchange).not.toHaveBeenCalled()
  })

  it('a tap sets the value at the touch point', async () => {
    const { input, surface, onchange } = setup(5)
    await fireEvent.pointerDown(surface, pt(18, 20))
    await fireEvent.pointerUp(window, pt(19, 21))
    expect(input.value).toBe('0')
    expect(onchange).toHaveBeenCalledWith(0)
  })

  it('keyboard and input events still work on the native control', async () => {
    const { input, onchange } = setup(5)
    await fireEvent.input(input, { target: { value: '7' } })
    expect(onchange).toHaveBeenCalledWith(7)
  })
})
