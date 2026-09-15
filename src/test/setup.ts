import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'

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
