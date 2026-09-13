<script lang="ts">
  import type { Snippet } from 'svelte'

  let { open = $bindable(false), title = '', children }: { open?: boolean; title?: string; children: Snippet } = $props()

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="backdrop" onclick={() => (open = false)} role="presentation"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
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
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 41;
    max-height: 92dvh;
    display: flex; flex-direction: column;
    background: var(--bg);
    border-radius: 20px 20px 0 0;
    box-shadow: var(--shadow);
    padding: 8px 16px calc(16px + env(safe-area-inset-bottom));
    animation: up 0.18s ease-out;
  }
  .handle { width: 40px; height: 4px; border-radius: 2px; background: var(--ink-3); margin: 0 auto 8px; flex: none; }
  .title { font-size: 18px; font-weight: 700; margin-bottom: 8px; flex: none; }
  .content { --map-h: min(30dvh, 300px); overflow-y: auto; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
  @keyframes up { from { transform: translateY(40px); } }
  @keyframes fade { from { opacity: 0; } }
</style>
