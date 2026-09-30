import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toastState, showToast, dismissToast } from './toast.svelte'

beforeEach(() => {
  vi.useFakeTimers()
  dismissToast()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('toast', () => {
  it('goes by itself after its time', () => {
    showToast('Salvato', undefined, 5000)
    vi.advanceTimersByTime(4999)
    expect(toastState.current?.message).toBe('Salvato')
    vi.advanceTimersByTime(1)
    expect(toastState.current).toBeNull()
  })

  it('a newer toast gets its own time: the older one does not take it away', () => {
    showToast('Salvato')
    vi.advanceTimersByTime(4000)
    showToast('Eliminato')
    vi.advanceTimersByTime(1000)
    expect(toastState.current?.message).toBe('Eliminato')
    vi.advanceTimersByTime(4000)
    expect(toastState.current).toBeNull()
  })
})
