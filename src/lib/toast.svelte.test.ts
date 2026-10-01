import { describe, it, expect, beforeEach } from 'vitest'
import { flushSync } from 'svelte'
import { toastState, showToast, dismissToast, closeToast } from './toast.svelte'

beforeEach(() => closeToast())

describe('toast and effects', () => {
  it('dismissToast in an effect does not make the effect depend on the toast: a sheet keeps its own toast', () => {
    let runs = 0
    const stop = $effect.root(() => {
      $effect(() => {
        runs++
        dismissToast()
      })
    })
    flushSync()
    showToast('Eliminato', { label: 'Annulla', run: () => {} })
    flushSync()
    expect(runs).toBe(1)
    expect(toastState.current?.message).toBe('Eliminato')
    stop()
  })
})
