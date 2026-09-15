import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/svelte'

// findBy*/waitFor default to 1s. A save fans out to every live query on the entries table, and on
// CI (two cores, every test file in its own worker, inside the nix sandbox) that can take longer:
// v0.2.2's deploy failed on two episode tests that pass locally in 250ms. Timing, not behaviour.
configure({ asyncUtilTimeout: 5000 })

// jsdom has no ResizeObserver; Svelte's bind:clientWidth needs one. Sizes stay at their defaults under tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// jsdom has no PointerEvent either; without it Testing Library fires a bare Event with no coordinates.
for (const g of [globalThis, window] as unknown as Record<string, unknown>[]) {
  if (typeof g.PointerEvent !== 'undefined') continue
  g.PointerEvent = class PointerEvent extends MouseEvent {
    pointerId: number
    pointerType: string
    isPrimary: boolean
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? ''
      this.isPrimary = init.isPrimary ?? false
    }
  }
}
