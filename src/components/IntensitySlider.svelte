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

<div class="slider" class:compact style="--fill: {color}; --ink-on: {ink}; --pct: {value / 10}">
  {#if label}<span class="label">{label}</span>{/if}
  <div class="track-wrap">
    <input
      type="range"
      min="0"
      max="10"
      step="1"
      {value}
      aria-label={label || 'intensity'}
      aria-valuetext={String(value)}
      oninput={onInput} />
    <span class="bubble" aria-hidden="true">{value}</span>
  </div>
</div>

<style>
  .slider { display: flex; flex-direction: column; gap: 2px; --thumb: 48px; }
  .compact { --thumb: 36px; }
  .label { font-size: 13px; font-weight: 600; color: var(--ink-2); padding-left: 2px; }
  .track-wrap { position: relative; }

  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: var(--thumb);
    margin: 0;
    padding: 0;
    background: transparent;
    touch-action: pan-y;
    display: block;
  }
  input[type='range']:focus { outline: none; }
  input[type='range']:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 999px; }

  input[type='range']::-webkit-slider-runnable-track {
    height: 16px;
    border-radius: 999px;
    background: linear-gradient(to right, var(--fill) calc(var(--pct) * 100%), var(--surface-2) calc(var(--pct) * 100%));
  }
  input[type='range']::-moz-range-track { height: 16px; border-radius: 999px; background: var(--surface-2); }
  input[type='range']::-moz-range-progress { height: 16px; border-radius: 999px; background: var(--fill); }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: var(--thumb);
    height: var(--thumb);
    margin-top: calc((16px - var(--thumb)) / 2);
    border-radius: 50%;
    background: var(--fill);
    border: 3px solid var(--surface);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  input[type='range']::-moz-range-thumb {
    width: var(--thumb);
    height: var(--thumb);
    border-radius: 50%;
    background: var(--fill);
    border: 3px solid var(--surface);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  /* Number drawn over the native thumb. Thumb centre moves from thumb/2 to width - thumb/2. */
  .bubble {
    position: absolute;
    top: 50%;
    left: calc(var(--thumb) / 2 + var(--pct) * (100% - var(--thumb)));
    transform: translate(-50%, -50%);
    pointer-events: none;
    font-weight: 800;
    font-size: 20px;
    color: var(--ink-on);
    font-variant-numeric: tabular-nums;
  }
  .compact .bubble { font-size: 15px; }
</style>
