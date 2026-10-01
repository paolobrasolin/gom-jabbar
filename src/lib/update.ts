/** The options of `registerSW` from `virtual:pwa-register` that this uses. */
export type Registrar = (options: {
  immediate?: boolean
  onNeedReload?: () => void
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void
}) => unknown

/**
 * A new release runs as soon as it is installed, not on the open after (§4). It is looked for at every open and every
 * return to the foreground (Android resumes an installed app far more often than it starts it). Untouched since the app
 * came to the foreground, the page reloads at once; touched, it waits for the next return, so a sheet being edited is
 * never thrown away. The log draft survives either way (§6.1). Returns a function that stops listening (for tests).
 */
export function keepUpdated(register: Registrar, reload = () => location.reload()): () => void {
  let touched = false
  let pending = false
  let registration: ServiceWorkerRegistration | undefined
  const touch = () => (touched = true)
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return
    if (pending) return reload()
    touched = false
    // Offline, or the server down: the app goes on as it is and looks again next time.
    registration?.update().catch(() => {})
  }
  document.addEventListener('pointerdown', touch, true)
  document.addEventListener('keydown', touch, true)
  document.addEventListener('visibilitychange', onVisibility)
  register({
    immediate: true,
    onNeedReload: () => (touched ? (pending = true) : reload()),
    onRegisteredSW: (_, r) => (registration = r),
  })
  return () => {
    document.removeEventListener('pointerdown', touch, true)
    document.removeEventListener('keydown', touch, true)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
