export type Toast = { id: number; message: string; action?: { label: string; run: () => void } }

/** `lift`: where the log's drawer ends, in px above the tab bar, so the toast sits over the stage and not over the slider (#23); null elsewhere. */
export const toastState = $state<{ current: Toast | null; lift: number | null }>({ current: null, lift: null })

let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

export function showToast(message: string, action?: Toast['action'], ms = 5000) {
  clearTimeout(timer)
  const id = ++seq
  toastState.current = { id, message, action }
  timer = setTimeout(() => {
    if (toastState.current?.id === id) toastState.current = null
  }, ms)
}

export function dismissToast() {
  clearTimeout(timer)
  toastState.current = null
}

export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported */
  }
}
