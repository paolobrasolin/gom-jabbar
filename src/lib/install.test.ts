import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { prefs } from './prefs.svelte'
import { install, installDue, isStandalone, isIOS, initInstall, requestInstall } from './install.svelte'

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

function fakePrompt(outcome: 'accepted' | 'dismissed'): PromptEvent {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as PromptEvent
  e.prompt = vi.fn(async () => {})
  e.userChoice = Promise.resolve({ outcome })
  return e
}

beforeEach(() => {
  prefs.installedAt = null
  install.dismissed = false
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('installDue', () => {
  it('shows whenever the app is not installed and not dismissed this session', () => {
    expect(installDue(false, null, false)).toBe(true)
    expect(installDue(true, null, false)).toBe(false)
    expect(installDue(false, '2026-09-01T00:00:00.000Z', false)).toBe(false)
    expect(installDue(false, null, true)).toBe(false)
  })
})

describe('isStandalone', () => {
  it('is false when matchMedia is missing (jsdom)', () => {
    expect(isStandalone()).toBe(false)
  })
  it('follows display-mode: standalone', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(display-mode: standalone)' }))
    expect(isStandalone()).toBe(true)
  })
  it('honours the Safari flag', () => {
    vi.stubGlobal('navigator', { ...navigator, standalone: true })
    expect(isStandalone()).toBe(true)
  })
})

describe('isIOS', () => {
  it('matches iPhone and iPad user agents, including iPadOS posing as a Mac', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true)
    expect(isIOS('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 5)).toBe(true)
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(isIOS('Mozilla/5.0 (Linux; Android 14; Pixel 7)', 5)).toBe(false)
  })
})

describe('initInstall', () => {
  it('asks for persistent storage at startup', () => {
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { ...navigator, storage: { persist } })
    initInstall()
    expect(persist).toHaveBeenCalledTimes(1)
  })
  it('records the first standalone launch and asks for persistent storage', () => {
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { ...navigator, storage: { persist } })
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(display-mode: standalone)' }))
    initInstall()
    expect(prefs.installedAt).not.toBeNull()
    expect(persist).toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem('gj.prefs')!).installedAt).toBe(prefs.installedAt)
  })
  it('survives a browser without navigator.storage', () => {
    vi.stubGlobal('navigator', { ...navigator, storage: undefined })
    expect(() => initInstall()).not.toThrow()
  })
  it('captures the browser install prompt and replays it on request', async () => {
    initInstall()
    expect(install.canPrompt).toBe(false)
    const e = fakePrompt('accepted')
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(install.canPrompt).toBe(true)
    await expect(requestInstall()).resolves.toBe('accepted')
    expect(e.prompt).toHaveBeenCalledTimes(1)
    expect(install.canPrompt).toBe(false)
  })
  it('reports a dismissed prompt and falls back to manual instructions afterwards', async () => {
    initInstall()
    window.dispatchEvent(fakePrompt('dismissed'))
    await expect(requestInstall()).resolves.toBe('dismissed')
    await expect(requestInstall()).resolves.toBe('manual')
  })
  it('marks the app installed when the browser says so', () => {
    initInstall()
    window.dispatchEvent(new Event('appinstalled'))
    expect(prefs.installedAt).not.toBeNull()
  })
})

describe('requestInstall', () => {
  it('is manual when no prompt was ever offered', async () => {
    await expect(requestInstall()).resolves.toBe('manual')
  })
})
