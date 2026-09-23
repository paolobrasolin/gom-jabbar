<!--
  The stage (§5.3, #22): one figure at a time, as large as its slot, under a camera; every tool that
  acts on the figure sits in the gutters beside it. Left rail: what the form puts there (the selection
  helpers, or the brush's undo and clear) and, while painting, zoom in, out and fit, the visible
  equivalents of a pinch. Right rail: the mind, level with the head; what the form puts there (the
  brush); and a thumbnail of the other side, which turns the figure over, so the other side is never
  out of sight. With paint off, a tap toggles a segment (a tap just off the skin lands on the nearest
  one) and a sideways swipe anywhere turns; with paint on, a finger on skin
  shades the current layer and only a swipe from the air turns; two fingers pan and pinch either way.
  Each view is fitted and centred on its own content box, since the CHOIR back sits off the front's
  centre. The slot never changes size for any of it. The camera maths is `lib/camera.ts`, the fingers
  are `lib/gesture.svelte.ts`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import BodyFigure from './BodyFigure.svelte'
  import Mind from './Mind.svelte'
  import ToolButton from './ToolButton.svelte'
  import { figureBox, viewBox, onFigure, type View } from '../lib/regions'
  import { prefs } from '../lib/prefs.svelte'
  import { intensityColor } from '../lib/color'
  import type { Layer } from '../lib/layers'
  import { layerLevel } from '../lib/summary'
  import { BRUSH, regionNear, type RawStroke } from '../lib/strokes'
  import { fitScale, lookAt, toFigure, zoomAt, MAX_ZOOM } from '../lib/camera'
  import { StageGesture } from '../lib/gesture.svelte'
  import { ICONS } from '../lib/icons'
  import { t } from '../i18n/index.svelte'

  let {
    view = $bindable('front'),
    layers = [],
    cur = 0,
    paint = false,
    labels = { front: '', back: '', mind: '' },
    onToggle,
    onStroke,
    tools,
    extra,
  }: {
    view?: View
    layers?: Layer[]
    cur?: number
    /** A finger on skin shades instead of tapping. */
    paint?: boolean
    labels?: { front: string; back: string; mind: string }
    onToggle?: (id: string) => void
    onStroke?: (gesture: RawStroke) => void
    /** The left rail. */
    tools?: Snippet
    /** The right rail, between the mind and the thumbnail. */
    extra?: Snippet
  } = $props()

  /** A rail's width and its gutter: the fitted figure stays clear of one column on each side. The sided pairs make a second column in the lower rows, beside the legs, where the figure is narrow: it overlaps only air. */
  const RAIL = 76
  /** How far off the skin a tap still lands on the nearest segment, in figure units. */
  const NEAR = 10
  const fig = $derived(prefs.figure)
  const box = $derived(figureBox(fig))
  const other = $derived<View>(view === 'front' ? 'back' : 'front')
  const vb = $derived(viewBox(fig, view))
  const ob = $derived(viewBox(fig, other))
  // The svg's viewBox is its own pixel size, so pointer offsets are viewBox units. jsdom reports no size: a phone-ish box.
  let cw = $state(0)
  let ch = $state(0)
  const size = $derived({ w: cw || 300, h: ch || 320 })
  /** The air between the rails, where the figure is fitted and centred. */
  const inner = $derived({ x: RAIL, w: Math.max(80, size.w - 2 * RAIL) })
  const fit = $derived(fitScale({ w: inner.w, h: size.h - 16 }, vb))
  const kRange = $derived<[number, number]>([fit, MAX_ZOOM * fit])
  const gesture = new StageGesture(() => ({ size, box, kRange }), { stroke: (points) => onStroke?.({ fig, view, points, w: BRUSH }), swipe: turn })
  function turn() {
    view = other
  }
  function fitAll() {
    const c = lookAt(size, fit, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 })
    gesture.camera = { ...c, tx: c.tx + inner.x + inner.w / 2 - size.w / 2 }
  }
  // A turn, a figure switch or a resize shows the whole figure; painting and pinching never move it otherwise.
  $effect(() => {
    void view
    void size
    void fit
    void inner
    fitAll()
  })
  const zoom = (f: number) => (gesture.camera = zoomAt(size, box, gesture.camera, f, kRange))
  /** Zoomed past the fit: Adatta has something to do. */
  const zoomed = $derived(gesture.camera.k > fit * 1.001)
  /** A new draft looks at the whole figure again. */
  export function refit() {
    fitAll()
  }
  /** The stroke in progress wears the colour of the layer it lands in (§5.4). */
  const liveColor = $derived(intensityColor(layers[cur] ? layerLevel(layers[cur]) : 0))

  const at = (e: MouseEvent): [number, number] => {
    const r = (e.currentTarget as Element).getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  /** A mouse's swipe ends with a click on whatever segment is under it: swallow that one. A tap's click may land in the air: see `pclick`. */
  let lift: 'swipe' | 'tap' | 'none' = 'none'
  function pdown(e: PointerEvent) {
    // A stroke may leave the stage and come back: capture it. Never while tapping, or the click would land on the stage, not the segment.
    if (paint) (e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    lift = 'none'
    const [x, y] = at(e)
    gesture.down(e.pointerId, x, y, { drag: e.button !== 0, paint: paint && onFigure(fig, view, ...toFigure(gesture.camera, x, y)) })
  }
  const pmove = (e: PointerEvent) => gesture.move(e.pointerId, ...at(e))
  function pup(e: PointerEvent) {
    const r = gesture.up(e.pointerId)
    lift = r === 'swipe' || r === 'tap' ? r : 'none'
  }
  function pclick(e: MouseEvent) {
    const was = lift
    lift = 'none'
    if (was === 'swipe') {
      e.stopPropagation()
      e.preventDefault()
    } else if (was === 'tap' && !paint && e.target === e.currentTarget) {
      // In the air, just off the skin: the nearest segment takes the tap.
      const id = regionNear(fig, view, ...toFigure(gesture.camera, ...at(e)), NEAR)
      if (id) onToggle?.(id)
    }
  }
</script>

<div class="stage" bind:clientWidth={cw} bind:clientHeight={ch}>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <svg
    class:paint
    viewBox="0 0 {size.w} {size.h}"
    role="group"
    aria-label={labels[view]}
    data-view={view}
    data-k={gesture.camera.k}
    data-tx={gesture.camera.tx}
    data-ty={gesture.camera.ty}
    onpointerdown={pdown}
    onpointermove={pmove}
    onpointerup={pup}
    onpointercancel={pup}
    onclickcapture={pclick}
    oncontextmenu={(e) => e.preventDefault()}>
    <g transform="translate({gesture.camera.tx} {gesture.camera.ty}) scale({gesture.camera.k})">
      <BodyFigure {view} {layers} {cur} live={gesture.stroke} {liveColor} readonly={paint} {onToggle} />
    </g>
  </svg>
  <!-- The side on show, captioned like the mind. -->
  <span class="caption" aria-hidden="true">{labels[view]}</span>
  <div class="rail left">
    {@render tools?.()}
  </div>
  <!-- The right rail is how you look at the figure: the mind aside, the brush, then the view group, zoom piled on the other side. -->
  <div class="rail right">
    <!-- The other side, a card like the mind's: tap it to turn the figure over. -->
    <button class="thumb" aria-label={labels[other]} onclick={turn}>
      <svg viewBox="{ob.x - 4} {ob.y - 4} {ob.w + 8} {ob.h + 8}" aria-hidden="true"><BodyFigure view={other} {layers} {cur} readonly /></svg>
      <span class="label">{labels[other]}</span>
    </button>
    <!-- The mind is not painted on: while the brush is out it makes room for the brush's tools. -->
    {#if !paint}<div class="mind"><Mind {layers} {cur} {onToggle} label={labels.mind} /></div>{/if}
    <span class="grow"></span>
    {@render extra?.()}
    <span class="gap"></span>
    <ToolButton compact icon={ICONS.zoomIn} label={t('log.zoomIn')} onclick={() => zoom(1.5)} />
    <ToolButton compact icon={ICONS.zoomOut} label={t('log.zoomOut')} disabled={!zoomed} onclick={() => zoom(1 / 1.5)} />
    <ToolButton compact icon={ICONS.fit} label={t('log.fit')} disabled={!zoomed} onclick={fitAll} />
  </div>
</div>

<style>
  .stage { position: relative; height: 100%; width: 100%; border-radius: 12px; background: var(--surface); overflow: hidden; }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    /* Every finger is ours, in either mode: nothing under the stage scrolls, and a pinch must never be taken for a scroll. */
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  svg.paint { cursor: crosshair; }
  /* The rails float over the figure: only their buttons take a finger, the air between them belongs to the figure. */
  .rail { position: absolute; top: 8px; bottom: 8px; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; pointer-events: none; }
  .rail > :global(*) { pointer-events: auto; }
  .rail.right { align-items: flex-end; width: 84px; gap: 6px; overflow-y: auto; scrollbar-width: none; }
  .rail.right::-webkit-scrollbar { display: none; }
  .gap { height: 6px; flex: none; }
  .caption { position: absolute; top: 12px; left: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-3); }
  /* A row of the left rail: one button, or a left and a right one side by side. */
  .rail.left > :global(.row) { display: flex; gap: 4px; }
  /* A short slot (a sheet) may not hold every button: the rail scrolls rather than losing its top. */
  .rail.left { left: 8px; justify-content: flex-end; overflow-y: auto; scrollbar-width: none; }
  .rail.left::-webkit-scrollbar { display: none; }
  .rail.right { right: 8px; }
  .grow { flex: 1; }
  /* The mind on a card of its own, wider than the rail, so a zoomed figure passes under it rather than through it. */
  .mind { width: 84px; padding: 6px 4px 4px; border-radius: 12px; background: var(--bg); }
  .thumb { display: flex; flex-direction: column; align-items: center; width: 84px; padding: 6px 4px 4px; border-radius: 12px; background: var(--bg); flex: none; }
  .thumb svg { height: 92px; width: auto; touch-action: manipulation; }
  .thumb .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-2); line-height: 1.35; }
</style>
