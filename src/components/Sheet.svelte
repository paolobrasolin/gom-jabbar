<script module lang="ts">
  /** The sheets open, bottom first: Escape closes only the top one, so a sheet over a sheet peels off one at a time. */
  const stack: symbol[] = []

  /**
   * Sheets in history (§6.2): while n sheets are open the current history entry says `sheet: n`, so Android's back
   * closes the top sheet and not the screen under it. One entry per level, not per sheet: a sheet closed by Salva,
   * Escape or the backdrop gives its step back only after the current task, so a sheet that hands over to another
   * (the episode sheet opening the edit sheet) reuses the step instead of racing an asynchronous `history.back()`.
   */
  const level = () => (history.state as { sheet?: number } | null)?.sheet ?? 0
  function enter(n: number) {
    const state = { ...(history.state ?? {}), sheet: n }
    if (level() >= n) history.replaceState(state, '')
    else history.pushState(state, '')
  }
  /** Steps back taken by `settle` and not landed yet. */
  let returning = 0
  /** Whether the popstate being dispatched is one of ours: then no sheet closes on it. */
  let ours = false
  function settle() {
    setTimeout(() => {
      if (level() > stack.length) {
        returning++
        history.back()
      }
    }, 0)
  }
  // Registered before any sheet mounts, so it runs first on every popstate. A sheet that opened while our step back was
  // in flight (a restore point handing over to the preview after a database read) wrote its level onto the entry being
  // left: once back has landed, its level goes on again instead of the sheet closing.
  addEventListener('popstate', () => {
    ours = returning > 0
    if (!ours) return
    returning--
    if (stack.length > level()) history.pushState({ ...(history.state ?? {}), sheet: stack.length }, '')
  })
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  /** `tall`: a fixed 92dvh, for a form whose slot and frame must not move (#22); otherwise the sheet is as tall as its content. */
  let { open = $bindable(false), title = '', tall = false, children }: { open?: boolean; title?: string; tall?: boolean; children: Snippet } = $props()

  let panel = $state<HTMLDivElement | undefined>()
  let returnTo: Element | null = null
  const token = Symbol()
  /** How many sheets sit under this one: a sheet over a sheet covers it, backdrop included. */
  let depth = $state(0)

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && stack.at(-1) === token) open = false
  }
  /** Back closed it: its history step is gone already. */
  let popped = false
  function onPop() {
    if (!ours && open && level() <= depth) {
      popped = true
      open = false
    }
  }
  // Move focus into the sheet when it opens and give it back when it closes.
  $effect(() => {
    if (open && panel) {
      depth = stack.length
      stack.push(token)
      returnTo = document.activeElement
      panel.focus()
      popped = false
      enter(depth + 1)
      return () => {
        stack.splice(stack.indexOf(token), 1)
        if (returnTo instanceof HTMLElement) returnTo.focus()
        if (!popped) settle()
      }
    }
  })
</script>

<svelte:window onkeydown={onKey} onpopstate={onPop} />

{#if open}
  <div class="backdrop" style="z-index: {40 + depth * 2}" onclick={() => (open = false)} role="presentation"></div>
  <div class="sheet" class:tall style="z-index: {41 + depth * 2}" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={panel}>
    <div class="handle"></div>
    {#if title}<h2 class="title">{title}</h2>{/if}
    <div class="content">{@render children()}</div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 40;
    background: rgba(0, 0, 0, 0.45);
    animation: fade 0.15s;
  }
  .sheet:focus { outline: none; }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 41;
    max-height: 92dvh;
    display: flex; flex-direction: column;
    background: var(--bg);
    border-radius: 20px 20px 0 0;
    box-shadow: var(--shadow);
    padding: 8px 12px calc(16px + env(safe-area-inset-bottom));
    animation: up 0.18s ease-out;
  }
  .handle { width: 40px; height: 4px; border-radius: 2px; background: var(--ink-3); margin: 0 auto 8px; flex: none; }
  .title { font-size: 18px; font-weight: 700; margin-bottom: 8px; flex: none; }
  .content { overflow-y: auto; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
  .sheet.tall { height: 92dvh; }
  /* clip, not hidden: the form's drawer reaches 12px past the content box, and a hidden box can still be scrolled by a
     focused chip or scrollIntoView, shifting the whole sheet sideways and cutting off Elimina and the layer pill. */
  .sheet.tall .content { flex: 1; overflow: clip; }
  @keyframes up { from { transform: translateY(40px); } }
  @keyframes fade { from { opacity: 0; } }
</style>
