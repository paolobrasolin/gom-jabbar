import { liveQuery } from 'dexie'

/**
 * Subscribe to a Dexie live query from a Svelte component.
 * `deps` is read inside the effect so the query re-subscribes when reactive inputs change.
 */
export function live<T>(deps: () => unknown, query: () => Promise<T>, initial: T): { readonly value: T } {
  let value = $state<T>(initial)
  $effect(() => {
    deps()
    const sub = liveQuery(query).subscribe({
      next: (v) => {
        value = v
      },
      error: (e) => console.error(e),
    })
    return () => sub.unsubscribe()
  })
  return {
    get value() {
      return value
    },
  }
}
