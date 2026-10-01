import { describe, it, expect, vi, beforeEach } from 'vitest'
import { keepUpdated, type Registrar } from './update'

let opts: Parameters<Registrar>[0]
let registration: { update: ReturnType<typeof vi.fn> }
const register: Registrar = (o) => {
  opts = o
  opts.onRegisteredSW?.('sw.js', registration as unknown as ServiceWorkerRegistration)
}
const setVisible = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

let stop: () => void
beforeEach(() => {
  registration = { update: vi.fn().mockResolvedValue(undefined) }
  stop?.()
})

describe('keepUpdated', () => {
  it('registers at once and reloads into a new release as soon as it takes over, when nothing was touched', () => {
    const reload = vi.fn()
    stop = keepUpdated(register, reload)
    expect(opts.immediate).toBe(true)
    opts.onNeedReload!()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('once the screen was touched, waits for the app to come back to the foreground, then reloads before anything else', () => {
    const reload = vi.fn()
    stop = keepUpdated(register, reload)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    opts.onNeedReload!()
    expect(reload).not.toHaveBeenCalled()
    setVisible('hidden')
    expect(reload).not.toHaveBeenCalled()
    setVisible('visible')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a key press counts as a touch too', () => {
    const reload = vi.fn()
    stop = keepUpdated(register, reload)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    opts.onNeedReload!()
    expect(reload).not.toHaveBeenCalled()
  })

  it('looks for a new release whenever the app comes back to the foreground, and forgets earlier touches', () => {
    const reload = vi.fn()
    stop = keepUpdated(register, reload)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    setVisible('hidden')
    expect(registration.update).not.toHaveBeenCalled()
    setVisible('visible')
    expect(registration.update).toHaveBeenCalledTimes(1)
    // Back in the foreground and not touched yet: a release found now reloads at once.
    opts.onNeedReload!()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('a failed check is ignored: offline, the app goes on as it is', async () => {
    registration.update.mockRejectedValue(new Error('offline'))
    stop = keepUpdated(register, vi.fn())
    setVisible('hidden')
    setVisible('visible')
    await Promise.resolve()
    expect(registration.update).toHaveBeenCalledTimes(1)
  })
})
