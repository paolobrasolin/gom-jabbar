import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toastState, showToast, showRefusal, showFailure, dismissToast, closeToast, holdToast, releaseToast, TOAST_MS } from './toast.svelte'

beforeEach(() => {
  vi.useFakeTimers()
  closeToast()
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
    showToast('Salvato', { label: 'Annulla', run: () => {} })
    vi.advanceTimersByTime(4000)
    showToast('Eliminato', { label: 'Annulla', run: () => {} })
    vi.advanceTimersByTime(TOAST_MS.undo - 1)
    expect(toastState.current?.message).toBe('Eliminato')
    vi.advanceTimersByTime(1)
    expect(toastState.current).toBeNull()
  })
})

describe('toast kinds (#94)', () => {
  it('a plain confirmation is quiet and short; one with an action is an undo and stays 10 s', () => {
    showToast('Backup su file fatto')
    expect(toastState.current?.kind).toBe('done')
    vi.advanceTimersByTime(TOAST_MS.done)
    expect(toastState.current).toBeNull()
    expect(TOAST_MS.done).toBeLessThan(5000)

    showToast('Eliminato', { label: 'Annulla', run: () => {} })
    expect(toastState.current?.kind).toBe('undo')
    expect(TOAST_MS.undo).toBe(10_000)
    vi.advanceTimersByTime(9999)
    expect(toastState.current?.message).toBe('Eliminato')
    vi.advanceTimersByTime(1)
    expect(toastState.current).toBeNull()
  })

  it('held, an undo does not run out; let go, it gets the rest of its time', () => {
    showToast('Eliminato', { label: 'Annulla', run: () => {} })
    vi.advanceTimersByTime(6000)
    holdToast()
    expect(toastState.held).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(toastState.current?.message).toBe('Eliminato')
    releaseToast()
    expect(toastState.held).toBe(false)
    vi.advanceTimersByTime(3999)
    expect(toastState.current?.message).toBe('Eliminato')
    vi.advanceTimersByTime(1)
    expect(toastState.current).toBeNull()
  })

  it('holding means nothing without a time: no toast, a failure; letting go of nothing changes nothing', () => {
    holdToast()
    expect(toastState.held).toBe(false)
    showFailure('Non riuscito: riprova')
    holdToast()
    expect(toastState.held).toBe(false)
    releaseToast()
    expect(toastState.current?.kind).toBe('failure')
    showToast('Fatto')
    releaseToast()
    vi.advanceTimersByTime(TOAST_MS.done)
    expect(toastState.current).toBeNull()
  })

  it('a toast replaced while held: the release does not revive the old time', () => {
    showToast('Eliminato', { label: 'Annulla', run: () => {} })
    holdToast()
    holdToast()
    showFailure('Non riuscito: riprova')
    expect(toastState.held).toBe(false)
    releaseToast()
    vi.advanceTimersByTime(60_000)
    expect(toastState.current?.kind).toBe('failure')
  })

  it('a refusal has its own kind and longer than a confirmation', () => {
    showRefusal('Quanto? Sposta la barra')
    expect(toastState.current?.kind).toBe('refusal')
    expect(TOAST_MS.refusal).toBeGreaterThan(TOAST_MS.done)
    vi.advanceTimersByTime(TOAST_MS.refusal - 1)
    expect(toastState.current?.kind).toBe('refusal')
    vi.advanceTimersByTime(1)
    expect(toastState.current).toBeNull()
  })

  it('a failure stays until closed: time and a change of screen leave it, a newer message replaces it', () => {
    showFailure('Non riuscito: riprova')
    expect(toastState.current?.kind).toBe('failure')
    vi.advanceTimersByTime(10 * 60_000)
    dismissToast()
    expect(toastState.current?.kind).toBe('failure')
    closeToast()
    expect(toastState.current).toBeNull()

    showFailure('Non riuscito: riprova')
    showToast('Salvato', { label: 'Annulla', run: () => {} })
    expect(toastState.current?.kind).toBe('undo')
  })

  it('a change of screen takes every other kind away', () => {
    for (const show of [() => showToast('Fatto'), () => showToast('Eliminato', { label: 'Annulla', run: () => {} }), () => showRefusal('No')]) {
      show()
      dismissToast()
      expect(toastState.current).toBeNull()
    }
  })
})
