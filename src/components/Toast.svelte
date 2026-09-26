<script lang="ts">
  import { toastState, dismissToast } from '../lib/toast.svelte'

</script>

{#if toastState.current}
  {@const t = toastState.current}
  <div class="toast" class:lifted={toastState.lift !== null} style:--lift={toastState.lift !== null ? `${toastState.lift}px` : undefined} role="status">
    <span class="grow">{t.message}</span>
    {#if t.action}
      <button
        class="action"
        onclick={() => {
          t.action?.run()
          dismissToast()
        }}>{t.action.label}</button>
    {/if}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(72px + env(safe-area-inset-bottom));
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 6px 6px 16px;
    border-radius: var(--radius);
    background: var(--ink);
    color: var(--bg);
    box-shadow: var(--shadow);
    animation: up 0.15s ease-out;
  }
  /* On the log: over the bottom of the stage, just above the drawer, clear of Salva and the slider. */
  .toast.lifted { bottom: calc(56px + env(safe-area-inset-bottom) + var(--lift) + 8px); }
  .action {
    min-height: var(--tap);
    padding: 0 14px;
    font-weight: 700;
    color: var(--toast-action);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  @keyframes up {
    from { transform: translateY(8px); opacity: 0; }
  }
</style>
