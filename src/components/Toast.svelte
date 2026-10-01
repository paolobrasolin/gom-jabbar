<script lang="ts">
  import { toastState, closeToast, holdToast, releaseToast } from '../lib/toast.svelte'
  import { t } from '../i18n/index.svelte'
  import { ICONS } from '../lib/icons'

  /** The kind in a shape as well as a colour (§10): an undo is a done with an action. */
  const ICON = { done: 'done', undo: 'done', refusal: 'needs', failure: 'failed' } as const
</script>

{#if toastState.current}
  {@const m = toastState.current}
  <!-- A finger on it holds its time (#94): an undo that is being read does not run out. -->
  <div
    class="toast {m.kind}"
    class:held={toastState.held}
    class:lifted={toastState.lift !== null}
    class:top={toastState.top}
    style:--lift={toastState.lift !== null ? `${toastState.lift}px` : undefined}
    role={m.kind === 'failure' ? 'alert' : 'status'}
    onpointerdown={holdToast}
    onpointerup={releaseToast}
    onpointercancel={releaseToast}
    onpointerleave={releaseToast}>
    <svg class="icon" data-icon={ICON[m.kind]} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {#each ICONS[ICON[m.kind]] as d, i (i)}<path {d} />{/each}
    </svg>
    <span class="grow">{m.message}</span>
    {#if m.action}
      <button
        class="action"
        onclick={() => {
          m.action?.run()
          closeToast()
        }}>{m.action.label}</button>
    {/if}
    {#if m.kind === 'failure'}
      <button class="close" aria-label={t('common.close')} onclick={closeToast}>✕</button>
    {/if}
    {#if m.kind === 'undo' && m.ms !== null}
      {#key m.id}<span class="time" style:animation-duration="{m.ms}ms" aria-hidden="true"></span>{/key}
    {/if}
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(16px + env(safe-area-inset-bottom));
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 10px;
    /* One height for every kind, the undo's: its 48px action and the padding around it. */
    min-height: calc(var(--tap) + 12px);
    padding: 6px 6px 6px 14px;
    overflow: hidden;
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    animation: up 0.15s ease-out;
  }
  /* On the log: over the bottom of the stage, just above the drawer, clear of Salva and the slider. */
  .toast.lifted { bottom: calc(var(--lift) + 8px); }
  /* On the log with the drawer pulled up: over the row of dropdowns, clear of the form. */
  .toast.top { top: calc(12px + env(safe-area-inset-top)); bottom: auto; }

  /* Done: quiet, the colours of the page. */
  .done { background: var(--surface); color: var(--ink); border: 1px solid var(--border); box-shadow: none; padding-right: 16px; }
  /* Undo: inverted, with the time left running out along its bottom edge. */
  .undo { background: var(--ink); color: var(--bg); }
  /* Refusal: warm, the app needs something before it goes on. */
  .refusal { background: var(--warn-bg); color: var(--warn-ink); font-weight: 600; padding-right: 16px; }
  /* Failure: red, stays until its ✕. */
  .failure { background: var(--fail-bg); color: var(--fail-ink); font-weight: 600; }

  .icon { flex: none; width: 20px; height: 20px; }
  .action {
    min-height: var(--tap);
    padding: 0 14px;
    font-weight: 700;
    color: var(--toast-action);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .close {
    min-width: var(--tap);
    min-height: var(--tap);
    color: inherit;
    font-size: 18px;
  }
  .time {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: 100%;
    background: var(--toast-action);
    transform-origin: left;
    animation-name: run-out;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }
  .held .time { animation-play-state: paused; }
  @keyframes run-out {
    to { transform: scaleX(0); }
  }
  @keyframes up {
    from { transform: translateY(8px); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast { animation: none; }
  }
</style>
