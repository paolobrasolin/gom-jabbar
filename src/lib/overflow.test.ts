import { describe, it, expect } from 'vitest'
import { overflowFade } from './overflow'

/** A row 200 wide holding 500 of content (jsdom has no layout: the sizes are set by hand). */
function row(scroll: number, size = 500, view = 200) {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollWidth', { value: size, configurable: true })
  Object.defineProperty(el, 'clientWidth', { value: view, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: size, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: view, configurable: true })
  el.scrollLeft = scroll
  el.scrollTop = scroll
  return el
}

describe('overflowFade', () => {
  it('marks the ends that hide content, and follows the scroll', () => {
    const el = row(0)
    const action = overflowFade(el)
    expect(el.dataset.more).toBe('end')
    el.scrollLeft = 100
    el.dispatchEvent(new Event('scroll'))
    expect(el.dataset.more).toBe('start end')
    el.scrollLeft = 300
    el.dispatchEvent(new Event('scroll'))
    expect(el.dataset.more).toBe('start')
    action.destroy()
    el.scrollLeft = 0
    el.dispatchEvent(new Event('scroll'))
    expect(el.dataset.more).toBe('start')
  })

  it('marks nothing when everything fits', () => {
    const el = row(0, 200)
    overflowFade(el)
    expect(el.dataset.more).toBe('')
  })

  it('reads the vertical axis when asked', () => {
    const el = row(150, 500)
    overflowFade(el, 'y')
    expect(el.dataset.more).toBe('start end')
  })
})
