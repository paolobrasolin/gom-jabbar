<!-- A rail button on the stage (#22): an icon with a short caption; the full name is what a screen reader hears. -->
<script lang="ts">
  let {
    icon,
    label,
    caption = label,
    pressed,
    disabled = false,
    compact = false,
    onclick,
  }: { icon: string[]; label: string; caption?: string; pressed?: boolean; disabled?: boolean; compact?: boolean; onclick?: () => void } = $props()
</script>

<button class="tool" class:compact aria-label={label} aria-pressed={pressed} {disabled} {onclick}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#each icon as d, i (i)}<path {d} />{/each}
  </svg>
  {#if !compact}<span aria-hidden="true">{caption}</span>{/if}
</button>

<style>
  .tool {
    width: 60px;
    height: 52px;
    border-radius: 12px;
    background: var(--surface-2);
    color: var(--ink);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
  }
  .tool[aria-pressed='true'] { background: var(--accent); color: var(--accent-ink); }
  .tool:disabled { opacity: 0.4; }
  /* Icon only: the zoom, which needs no word. */
  .tool.compact { width: 60px; height: 44px; }
  svg { width: 22px; height: 22px; }
</style>
