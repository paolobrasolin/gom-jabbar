<script lang="ts">
  import type { Snippet } from 'svelte'

  let { open = $bindable(false), title = '', children }: { open?: boolean; title?: string; children: Snippet } = $props()

  let panel = $state<HTMLDivElement | undefined>()
  let returnTo: Element | null = null

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false
  }
  // Move focus into the sheet when it opens and give it back when it closes.
  $effect(() => {
    if (open && panel) {
      returnTo = document.activeElement
      panel.focus()
      return () => {
        if (returnTo instanceof HTMLElement) returnTo.focus()
      }
    }
  })
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="backdrop" onclick={() => (open = false)} role="presentation"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title} tabindex="-1" bind:this={panel}>
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
  .content { --map-h: 32dvh; --map-min: 32dvh; --map-max: 32dvh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
  @keyframes up { from { transform: translateY(40px); } }
  @keyframes fade { from { opacity: 0; } }
</style>
