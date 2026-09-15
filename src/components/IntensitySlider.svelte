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
  const thumb = $derived(compact ? 36 : 48)

  let input = $state<HTMLInputElement | undefined>()

  function set(v: number) {
    if (v === value) return
    value = v
    onchange?.(v)
    haptic(6)
  }
  /** Keyboard and assistive tech drive the native control directly. */
  function onInput(e: Event) {
    set(Number((e.target as HTMLInputElement).value))
  }

  /*
   * Touch goes through the wrapper, not the native input: Chrome's range input moves the thumb on
   * every touchmove whatever its direction, so a finger scrolling the page over a slider dragged it (#14).
   * The wrapper decides the gesture from its first moves: mostly horizontal drives the value, mostly
   * vertical is left to the browser, which scrolls (touch-action: pan-y) and sends pointercancel.
   */
  const SLOP = 6
  let drag: { id: number; x0: number; y0: number; mode: 'h' | 'v' | null } | null = null

  /** Value under a pointer: the thumb centre travels from thumb/2 to width - thumb/2, like the native control. */
  function valueAt(clientX: number): number {
    if (!input) return value
    const r = input.getBoundingClientRect()
    const pct = (clientX - r.left - thumb / 2) / Math.max(1, r.width - thumb)
    return Math.round(Math.min(1, Math.max(0, pct)) * 10)
  }
  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: e.pointerType === 'mouse' ? 'h' : null }
    if (drag.mode === 'h') set(valueAt(e.clientX))
    input?.focus({ preventScroll: true })
    e.preventDefault()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }
  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return
    if (drag.mode === null) {
      const dx = Math.abs(e.clientX - drag.x0)
      const dy = Math.abs(e.clientY - drag.y0)
      if (dx < SLOP && dy < SLOP) return
      drag.mode = dx > dy ? 'h' : 'v'
    }
    if (drag.mode === 'h') set(valueAt(e.clientX))
  }
  function up(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return
    // A tap (no decisive move) or the end of a horizontal drag lands the value under the finger.
    if (drag.mode !== 'v') set(valueAt(e.clientX))
    end()
  }
  function cancel(e: PointerEvent) {
    if (drag && e.pointerId === drag.id) end()
  }
  function end() {
    drag = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
  }
</script>

<div class="slider" class:compact style="--fill: {color}; --ink-on: {ink}; --pct: {value / 10}">
  {#if label}<span class="label">{label}</span>{/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="track-wrap" onpointerdown={down}>
    <input
      bind:this={input}
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
  .track-wrap { position: relative; touch-action: pan-y; }

  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: var(--thumb);
    margin: 0;
    padding: 0;
    background: transparent;
    /* Pointers are handled by the wrapper (see the script); the native control keeps keyboard and a11y. */
    pointer-events: none;
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
