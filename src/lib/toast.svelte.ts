import { untrack } from 'svelte'

/**
 * Four kinds of message, each with its own look and time (#94): `done`, a quiet confirmation; `undo`, a confirmation
 * with an action, the only protection of a delete, held still while touched; `refusal`, the app asks for something
 * before it goes on; `failure`, something did not happen, until closed.
 */
export type ToastKind = 'done' | 'undo' | 'refusal' | 'failure'
export type Toast = { id: number; kind: ToastKind; message: string; action?: { label: string; run: () => void }; ms: number | null }

/** How long each kind stays, in ms; a failure has no time. */
export const TOAST_MS = { done: 3000, undo: 10_000, refusal: 7000 } as const

/**
 * `lift`: where the log's drawer ends, in px above the bottom of the screen, so the toast sits over the stage and not over the slider
 * (#23); null elsewhere. `top`: the log's drawer is pulled up, so the toast shows at the top of the screen instead.
 * `held`: a finger is on the toast, so its time stands still.
 */
export const toastState = $state<{ current: Toast | null; lift: number | null; top: boolean; held: boolean }>({ current: null, lift: null, top: false, held: false })

let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
/** Time left when held; when the time runs out otherwise. */
let left = 0
let deadline = 0

function show(kind: ToastKind, message: string, action: Toast['action'], ms: number | null) {
  clearTimeout(timer)
  const id = ++seq
  toastState.current = { id, kind, message, action, ms }
  toastState.held = false
  if (ms !== null) run(ms)
}

/** Every replacement, close and hold clears the timer first, so the one running is always the current toast's. */
function run(ms: number) {
  deadline = Date.now() + ms
  timer = setTimeout(() => (toastState.current = null), ms)
}

/** A confirmation: quiet without an action, an undo (or another action) with one. */
export function showToast(message: string, action?: Toast['action'], ms?: number) {
  const kind = action ? 'undo' : 'done'
  show(kind, message, action, ms ?? TOAST_MS[kind])
}

/** The app will not go on until something is changed: the field to fix is named in the message. */
export function showRefusal(message: string) {
  show('refusal', message, undefined, TOAST_MS.refusal)
}

/** Something did not happen. Stays until closed or replaced: it must not be missed. */
export function showFailure(message: string) {
  show('failure', message, undefined, null)
}

/** A finger on the toast: its time stands still. */
export function holdToast() {
  const cur = toastState.current
  if (!cur || cur.ms === null || toastState.held) return
  clearTimeout(timer)
  left = Math.max(0, deadline - Date.now())
  toastState.held = true
}

/** The finger lifted: the toast gets the rest of its time. */
export function releaseToast() {
  // Held means a toast with a time is showing: showing another or closing it lets go first.
  if (!toastState.held) return
  toastState.held = false
  run(left)
}

/**
 * A change of screen, or a sheet opening: every message goes but a failure, which stays until closed. Called from
 * effects, so the read is untracked: the effect must not rerun, and wipe the sheet's own toast, when one shows.
 */
export function dismissToast() {
  if (untrack(() => toastState.current?.kind) === 'failure') return
  closeToast()
}

/** Whatever is showing goes: its ✕, its action, or a test starting clean. */
export function closeToast() {
  clearTimeout(timer)
  toastState.current = null
  toastState.held = false
}

export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported */
  }
}
