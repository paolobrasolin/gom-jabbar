import { prefs, savePrefs } from './prefs.svelte'

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

// Chrome fires `beforeinstallprompt` early, possibly before the Log screen mounts: keep it here, not in a component.
let deferred: BeforeInstallPromptEvent | null = null

/** `dismissed` lives here so switching tabs (which remounts Log) does not bring the nudge back until the next launch. */
export const install = $state({ dismissed: false, canPrompt: false })

export function isStandalone(): boolean {
  if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) return true
  return (navigator as { standalone?: boolean }).standalone === true
}

/** iPadOS 13+ reports itself as a Mac; the touch points give it away. */
export function isIOS(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
}

/** The nudge shows whenever the app is not installed, every launch, until dismissed for this session. */
export function installDue(standalone: boolean, installedAt: string | null, dismissed: boolean): boolean {
  return !standalone && !installedAt && !dismissed
}

function markInstalled() {
  prefs.installedAt = new Date().toISOString()
  savePrefs()
  // Installed origins get persistent storage without a prompt: ask again now that it can succeed.
  persist()
}

/** Ask the browser not to evict our storage. Best effort. */
function persist() {
  navigator.storage?.persist?.().catch(() => {})
}

/** Once at startup: capture the browser's install prompt, note the first standalone launch, ask for persistent storage. */
export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    install.canPrompt = true
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    install.canPrompt = false
    markInstalled()
  })
  if (isStandalone() && !prefs.installedAt) markInstalled()
  else persist()
}

/** Replay the browser's install prompt when one was captured; `manual` means the sheet has to explain the steps. */
export async function requestInstall(): Promise<'accepted' | 'dismissed' | 'manual'> {
  const ev = deferred
  if (!ev) return 'manual'
  deferred = null
  install.canPrompt = false
  await ev.prompt()
  return (await ev.userChoice).outcome
}
