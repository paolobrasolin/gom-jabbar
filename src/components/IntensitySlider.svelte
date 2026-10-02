<script lang="ts">
  import { intensityColor, intensityInk } from '../lib/color'
  import { haptic } from '../lib/toast.svelte'
  import { t } from '../i18n/index.svelte'

  /** `value` null: nothing recorded yet (§6.1 item 7); the slider shows "–" and its track empty until it is touched. */
  let {
    value = $bindable(null),
    label = '',
    onchange,
  }: { value?: number | null; label?: string; onchange?: (v: number) => void } = $props()

  const blank = $derived(value === null || value === undefined)
  /** What a number at either end means (#112): read aloud there, written inside the track. */
  const valueText = $derived(blank ? t('slider.unset') : value === 0 ? `0 ${t('scale.min')}` : value === 10 ? `10 ${t('scale.max')}` : String(value))
  const color = $derived(blank ? 'var(--c-zero)' : intensityColor(value!))
  const ink = $derived(blank ? 'var(--ink-2)' : intensityInk(value!))
  /** One size for every symptom, pain included (#37). */
  const thumb = 36

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
    if (!input) return value ?? 0
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

<div class="slider" class:blank style="--fill: {color}; --ink-on: {ink}; --pct: {(value ?? 0) / 10}">
  {#if label}<span class="label">{label}</span>{/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="track-wrap" onpointerdown={down}>
    <!-- The track's unfilled part, with the ends in words (#112): behind the input, so the fill and the thumb cover them. -->
    <div class="ends" aria-hidden="true"><span>{t('scale.min')}</span><span>{t('scale.max')}</span></div>
    <input
      bind:this={input}
      type="range"
      min="0"
      max="10"
      step="1"
      value={value ?? 0}
      aria-label={label || 'intensity'}
      aria-valuetext={valueText}
      oninput={onInput} />
    <span class="bubble" aria-hidden="true">{blank ? '–' : value}</span>
  </div>
</div>

<style>
  .slider { display: flex; flex-direction: column; gap: 2px; --thumb: 36px; --reach: calc(var(--thumb) / 2 + var(--pct) * (100% - var(--thumb))); }
  .label { font-size: 13px; font-weight: 600; color: var(--ink-2); padding-left: 2px; }
  /* The slider looks 36px tall but takes a finger over 48 (§10), without taking more room. */
  .track-wrap { position: relative; touch-action: pan-y; padding: 6px 0; margin: -6px 0; }
  /*
   * The track is as tall as the thumb (#112), so its ends can say what 0 and 10 mean at the size of a label, in a row the
   * thumb already takes. The words start past the thumb at 0; --ink, since --ink-2 on the zero grey is under 4.5:1 in light.
   */
  .ends {
    position: absolute;
    inset: 6px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 0 14px 0 calc(var(--thumb) + 10px);
    border-radius: 999px;
    background: var(--c-zero);
    box-shadow: inset 0 0 0 1px var(--border);
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    pointer-events: none;
  }

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
    position: relative;
  }
  input[type='range']:focus { outline: none; }
  input[type='range']:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 999px; }

  /* The fill runs to the thumb's centre; the unfilled part is transparent over .ends, the zero grey with an edge (#23). */
  input[type='range']::-webkit-slider-runnable-track {
    height: var(--thumb);
    border-radius: 999px;
    background: linear-gradient(to right, var(--fill) var(--reach), transparent var(--reach));
  }
  .blank input[type='range']::-webkit-slider-runnable-track { background: transparent; }
  input[type='range']::-moz-range-track { height: var(--thumb); border-radius: 999px; background: transparent; }
  input[type='range']::-moz-range-progress { height: var(--thumb); border-radius: 999px; background: var(--fill); }
  .blank input[type='range']::-moz-range-progress { background: transparent; }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: var(--thumb);
    height: var(--thumb);
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
    z-index: 1;
    top: 50%;
    left: calc(var(--thumb) / 2 + var(--pct) * (100% - var(--thumb)));
    transform: translate(-50%, -50%);
    pointer-events: none;
    font-weight: 800;
    font-size: 15px;
    color: var(--ink-on);
    font-variant-numeric: tabular-nums;
  }
</style>
