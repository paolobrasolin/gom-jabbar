<!--
  The drawing surface (§5.3): one figure enlarged under a camera; a finger paints a stroke on the
  current body area, two fingers pan and pinch. The camera lives in `lib/camera.ts`, the fingers in
  `lib/gesture.svelte.ts`, so another layout (#22) can put the same figure and gestures elsewhere.
-->
<script lang="ts">
  import { untrack } from 'svelte'
  import BodyFigure from './BodyFigure.svelte'
  import { figureBox, type View } from '../lib/regions'
  import { prefs } from '../lib/prefs.svelte'
  import { intensityColor } from '../lib/color'
  import { bodyTarget, type Area } from '../lib/areas'
  import { figureCenter, BRUSH, type RawStroke } from '../lib/strokes'
  import { fitScale, lookAt, ZOOM, ZOOM_RANGE } from '../lib/camera'
  import { PaintGesture } from '../lib/gesture.svelte'

  let {
    view,
    areas = [],
    cur = 0,
    brush = 0,
    label = '',
    onStroke,
  }: {
    view: View
    areas?: Area[]
    cur?: number
    /** The level a stroke starts a new area at, and the colour of the stroke in progress. */
    brush?: number
    label?: string
    onStroke?: (gesture: RawStroke) => void
  } = $props()

  const fig = $derived(prefs.figure)
  const box = $derived(figureBox(fig))
  // The svg's viewBox is its own pixel size, so pointer offsets are viewBox units. jsdom reports no size: a phone-ish box.
  let cw = $state(0)
  let ch = $state(0)
  const size = $derived({ w: cw || 300, h: ch || 320 })
  const fit = $derived(fitScale(size, box))
  const gesture = new PaintGesture(
    () => ({ size, box, kRange: [ZOOM_RANGE[0] * fit, ZOOM_RANGE[1] * fit] }),
    (points) => onStroke?.({ fig, view, points, w: BRUSH }),
  )
  // Opening, a view or figure switch, or a resize looks at the current area; later strokes do not move the camera.
  $effect(() => {
    const [v, f, s, k] = [view, fig, size, ZOOM * fit]
    gesture.camera = lookAt(s, k, figureCenter(f, untrack(() => areas[cur]?.regions ?? []), v))
  })
  /** The stroke in progress wears the colour of the area it will land in (§5.4). */
  const liveColor = $derived.by(() => {
    const target = bodyTarget({ areas, cur }, brush)
    return intensityColor(target.areas[target.cur].intensity)
  })

  const at = (e: PointerEvent): [number, number] => {
    const r = (e.currentTarget as Element).getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  function pdown(e: PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    gesture.down(e.pointerId, ...at(e), e.button !== 0)
  }
  const pmove = (e: PointerEvent) => gesture.move(e.pointerId, ...at(e))
  const pup = (e: PointerEvent) => gesture.up(e.pointerId)
</script>

<div class="surface" bind:clientWidth={cw} bind:clientHeight={ch}>
  <!-- A drawing surface: nothing here is reachable by keyboard; the regions are, on the ordinary map. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <svg
    viewBox="0 0 {size.w} {size.h}"
    role="img"
    aria-label={label}
    data-k={gesture.camera.k}
    data-tx={gesture.camera.tx}
    data-ty={gesture.camera.ty}
    onpointerdown={pdown}
    onpointermove={pmove}
    onpointerup={pup}
    onpointercancel={pup}
    oncontextmenu={(e) => e.preventDefault()}>
    <g transform="translate({gesture.camera.tx} {gesture.camera.ty}) scale({gesture.camera.k})">
      <BodyFigure {view} {areas} {cur} live={gesture.stroke} {liveColor} readonly />
    </g>
  </svg>
</div>

<style>
  .surface {
    height: 100%;
    width: 100%;
    border-radius: 12px;
    background: var(--surface);
    overflow: hidden;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    cursor: crosshair;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
</style>
