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
