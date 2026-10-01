import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/svelte'
import { tick } from 'svelte'
import Toast from './Toast.svelte'
import { toastState, showToast, showRefusal, showFailure, closeToast } from '../lib/toast.svelte'
import { prefs } from '../lib/prefs.svelte'

beforeEach(() => {
  closeToast()
  prefs.lang = 'it'
})

const box = () => screen.getByText(/./, { selector: '.toast .grow' }).closest('.toast')!

describe('Toast (#94)', () => {
  it('each kind has its own look; only a failure is an alert, the rest are status messages', async () => {
    render(Toast)
    for (const [show, kind, role] of [
      [() => showToast('Fatto'), 'done', 'status'],
      [() => showToast('Eliminato', { label: 'Annulla', run: () => {} }), 'undo', 'status'],
      [() => showRefusal('Quanto? Sposta la barra'), 'refusal', 'status'],
      [() => showFailure('Non riuscito: riprova'), 'failure', 'alert'],
    ] as const) {
      show()
      await tick()
      expect(box()).toHaveClass(kind)
      // The live region holds the toast; the toast itself has no role (BX9).
      expect(box()).not.toHaveAttribute('role')
      expect(box().parentElement).toHaveAttribute('role', role)
    }
  })

  it('the live regions are in the page before any message, so a screen reader announces the message that appears in them', async () => {
    render(Toast)
    const status = document.querySelector('.live[role=status]')!
    const alert = document.querySelector('.live[role=alert]')!
    expect(status).toBeEmptyDOMElement()
    expect(alert).toBeEmptyDOMElement()
    showToast('Salvato', { label: 'Annulla', run: () => {} })
    await tick()
    expect(status).toHaveTextContent('Salvato')
    expect(document.querySelector('.live[role=status]')).toBe(status)
    showFailure('Non riuscito: riprova')
    await tick()
    expect(alert).toHaveTextContent('Non riuscito: riprova')
    expect(status).toBeEmptyDOMElement()
  })

  it('each kind has its icon, so the kind never rests on colour alone (#94)', async () => {
    render(Toast)
    for (const [show, icon] of [
      [() => showToast('Fatto'), 'done'],
      [() => showToast('Eliminato', { label: 'Annulla', run: () => {} }), 'done'],
      [() => showRefusal('Quanto? Sposta la barra'), 'needs'],
      [() => showFailure('Non riuscito: riprova'), 'failed'],
    ] as const) {
      show()
      await tick()
      const svg = box().querySelector('svg.icon')!
      expect(svg).toHaveAttribute('data-icon', icon)
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
    }
  })

  it('an undo shows its time running out, and a finger on it holds the time', async () => {
    render(Toast)
    showToast('Eliminato', { label: 'Annulla', run: () => {} })
    await tick()
    const bar = box().querySelector('.time') as HTMLElement
    expect(bar).not.toBeNull()
    expect(bar.style.animationDuration).toBe('10000ms')
    await fireEvent.pointerDown(box())
    expect(toastState.held).toBe(true)
    expect(box()).toHaveClass('held')
    await fireEvent.pointerUp(box())
    expect(toastState.held).toBe(false)
    await fireEvent.pointerDown(box())
    await fireEvent.pointerCancel(box())
    expect(toastState.held).toBe(false)
    await fireEvent.pointerDown(box())
    // pointerleave does not bubble: the browser fires it on the region the finger leaves with the toast.
    await fireEvent.pointerLeave(box().parentElement!)
    expect(toastState.held).toBe(false)
  })

  it('a quiet confirmation and a refusal show no time bar', async () => {
    render(Toast)
    showToast('Fatto')
    await tick()
    expect(box().querySelector('.time')).toBeNull()
    showRefusal('No')
    await tick()
    expect(box().querySelector('.time')).toBeNull()
  })

  it('a failure closes with its ✕, and only then', async () => {
    render(Toast)
    showFailure('Non riuscito: riprova')
    await tick()
    await fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(toastState.current).toBeNull()
    showToast('Fatto')
    await tick()
    expect(screen.queryByRole('button', { name: 'Chiudi' })).toBeNull()
  })

  it('the action runs and closes the toast', async () => {
    render(Toast)
    const run = vi.fn()
    showToast('Eliminato', { label: 'Annulla', run })
    await tick()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(run).toHaveBeenCalledOnce()
    expect(toastState.current).toBeNull()
  })
})
