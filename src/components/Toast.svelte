<script lang="ts">
  import { toastState, dismissToast } from '../lib/toast.svelte'

  let { raised = false }: { raised?: boolean } = $props()
</script>

{#if toastState.current}
  {@const t = toastState.current}
  <div class="toast" class:raised role="status">
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
    padding: 12px 16px;
    border-radius: var(--radius);
    background: var(--ink);
    color: var(--bg);
    box-shadow: var(--shadow);
    animation: up 0.15s ease-out;
  }
  .toast.raised { bottom: calc(148px + env(safe-area-inset-bottom)); }
  .action {
    min-height: 36px;
    padding: 0 10px;
    font-weight: 700;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  @keyframes up {
    from { transform: translateY(8px); opacity: 0; }
  }
</style>
