<script module lang="ts">
  /** The sheets open, bottom first: Escape closes only the top one, so a sheet over a sheet peels off one at a time. */
  const stack: symbol[] = []
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
  // Move focus into the sheet when it opens and give it back when it closes.
  $effect(() => {
    if (open && panel) {
      depth = stack.length
      stack.push(token)
      returnTo = document.activeElement
      panel.focus()
      return () => {
        stack.splice(stack.indexOf(token), 1)
        if (returnTo instanceof HTMLElement) returnTo.focus()
      }
    }
  })
</script>

<svelte:window onkeydown={onKey} />

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
  .sheet.tall .content { flex: 1; overflow: hidden; }
  @keyframes up { from { transform: translateY(40px); } }
  @keyframes fade { from { opacity: 0; } }
</style>
