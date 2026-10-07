<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A fold (#120): one full-width row, the whole row the button, the chevron at its end. Closed, it says what it holds
   * after its label, "Rimedi (7)  Impacco caldo 4 · Compressione 3 · …", cut short where the line ends.
   */
  let { label, summary = '', open = $bindable(false), children }: { label: string; summary?: string; open?: boolean; children: Snippet } = $props()
</script>

<button class="fold" aria-expanded={open} onclick={() => (open = !open)}>
  <span class="text"><b>{label}</b>{#if !open && summary}<span class="summary">{summary}</span>{/if}</span>
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if open}<path d="M6 15l6-6 6 6" />{:else}<path d="M6 9l6 6 6-6" />{/if}
  </svg>
</button>
{#if open}{@render children()}{/if}

<style>
  .fold {
    width: 100%; min-height: 44px; display: flex; align-items: center; gap: 10px;
    border-top: 1px solid var(--border); text-align: left; color: var(--ink-2);
  }
  .fold svg { flex: none; margin-left: auto; }
  .text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
  b { color: var(--ink); font-weight: 600; }
  .summary { margin-left: 8px; }
</style>
