<script lang="ts">
  import { intensityColor, intensityInk } from '../lib/color'
  import { haptic } from '../lib/toast.svelte'

  let {
    value = $bindable(5),
    label = '',
    compact = false,
    onchange,
  }: { value?: number; label?: string; compact?: boolean; onchange?: (v: number) => void } = $props()

  const color = $derived(intensityColor(value))
  const ink = $derived(intensityInk(value))

  function onInput(e: Event) {
    const v = Number((e.target as HTMLInputElement).value)
    if (v !== value) {
      value = v
      onchange?.(v)
      haptic(6)
    }
  }
</script>

<div class="slider" class:compact style="--fill: {color}; --ink-on: {ink}; --pct: {value * 10}%">
  <div class="head">
    {#if label}<span class="label">{label}</span>{/if}
    <span class="value" aria-hidden="true">{value}</span>
  </div>
  <input
    type="range"
    min="0"
    max="10"
    step="1"
    {value}
    aria-label={label || 'intensity'}
    aria-valuetext={String(value)}
    oninput={onInput} />
</div>

<style>
  .slider { display: flex; flex-direction: column; gap: 4px; }
  .head { display: flex; align-items: baseline; justify-content: space-between; }
  .label { font-weight: 600; color: var(--ink-2); }
  .value {
    font-size: 44px;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    margin-left: auto;
    transition: color 0.12s;
  }
  .compact .value { font-size: 22px; }

  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 56px;
    margin: 0;
    padding: 0;
    background: transparent;
    touch-action: pan-y;
  }
  .compact input[type='range'] { height: 44px; }
  input[type='range']:focus { outline: none; }
  input[type='range']:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 999px; }

  /* Track */
  input[type='range']::-webkit-slider-runnable-track {
    height: 18px;
    border-radius: 999px;
    background: linear-gradient(to right, var(--fill) var(--pct), var(--surface-2) var(--pct));
  }
  input[type='range']::-moz-range-track {
    height: 18px;
    border-radius: 999px;
    background: var(--surface-2);
  }
  input[type='range']::-moz-range-progress {
    height: 18px;
    border-radius: 999px;
    background: var(--fill);
  }
  /* Thumb */
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 40px;
    height: 40px;
    margin-top: -11px;
    border-radius: 50%;
    background: var(--fill);
    border: 4px solid var(--surface);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  input[type='range']::-moz-range-thumb {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--fill);
    border: 4px solid var(--surface);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  .compact input[type='range']::-webkit-slider-thumb { width: 32px; height: 32px; margin-top: -7px; }
</style>
