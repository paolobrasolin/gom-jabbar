import { liveQuery } from 'dexie'

/**
 * Whether any live query has failed (§4.1): the database closed by the browser, storage gone. A failed query keeps its
 * initial value, an empty list, so the app says the diary could not be read rather than letting it look empty.
 */
export const reads = $state({ failed: false })

/**
 * Subscribe to a Dexie live query from a Svelte component.
 * `deps` is read inside the effect so the query re-subscribes when reactive inputs change.
 */
export function live<T>(deps: () => unknown, query: () => Promise<T>, initial: T): { readonly value: T } {
  // Raw on purpose: query results are plain objects that get handed back to Dexie (proxies cannot be structured-cloned).
  let value = $state.raw<T>(initial)
  $effect(() => {
    deps()
    const sub = liveQuery(query).subscribe({
      next: (v) => {
        value = v
      },
      error: (e) => {
        console.error(e)
        reads.failed = true
      },
    })
    return () => sub.unsubscribe()
  })
  return {
    get value() {
      return value
    },
  }
}
