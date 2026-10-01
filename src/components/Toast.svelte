<script lang="ts">
  import { toastState, closeToast, holdToast, releaseToast, type Toast } from '../lib/toast.svelte'
  import { t } from '../i18n/index.svelte'
  import MessageIcon from './MessageIcon.svelte'

  /** The kind in a shape as well as a colour (§10): an undo is a done with an action. */
  const ICON = { done: 'done', undo: 'done', refusal: 'needs', failure: 'failed' } as const
  /** A finger on the toast holds its time (#94): an undo being read does not run out. On its region, which has a role. */
  const hold = { onpointerdown: holdToast, onpointerup: releaseToast, onpointercancel: releaseToast, onpointerleave: releaseToast }
</script>

<!--
  Two live regions always in the page, empty until a message shows inside one (BX9): a region inserted together with
  its text is often not announced. A failure is an alert; every other kind a status.
-->
<div class="live" role="status" {...hold}>{#if toastState.current && toastState.current.kind !== 'failure'}{@render toast(toastState.current)}{/if}</div>
<div class="live" role="alert" {...hold}>{#if toastState.current?.kind === 'failure'}{@render toast(toastState.current)}{/if}</div>

{#snippet toast(m: Toast)}
  <div
    class="msg toast {m.kind}"
    class:held={toastState.held}
    class:lifted={toastState.lift !== null}
    class:top={toastState.top}
    style:--lift={toastState.lift !== null ? `${toastState.lift}px` : undefined}
>
    <MessageIcon name={ICON[m.kind]} />
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
{/snippet}

<style>
  .toast {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(16px + env(safe-area-inset-bottom));
    z-index: 50;
    overflow: hidden;
    box-shadow: var(--shadow);
    animation: up 0.15s ease-out;
  }
  /* On the log: over the bottom of the stage, just above the drawer, clear of Salva and the slider. */
  .toast.lifted { bottom: calc(var(--lift) + 8px); }
  /* On the log with the drawer pulled up: over the row of dropdowns, clear of the form. */
  .toast.top { top: calc(12px + env(safe-area-inset-top)); bottom: auto; }

  /* The colours of each kind are global (app.css, .msg); a quiet confirmation casts no shadow. */
  .done { box-shadow: none; }

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
