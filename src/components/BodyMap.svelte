<script lang="ts">
  import { untrack } from 'svelte'
  import { regionsFor, shapeArea, shapeOf, pathFor, figureBox, type View, type RegionDef } from '../lib/regions'
  import { prefs } from '../lib/prefs.svelte'
  import { intensityColor } from '../lib/color'
  import { isFull, type Area, type Stroke } from '../lib/areas'
  import { intensityColor as ic } from '../lib/color'
  import { regionLabel } from '../lib/regionLabel'
  import { clientToFigure, figureCenter, strokePath, BRUSH, type HeatStroke } from '../lib/strokes'
  import { t } from '../i18n/index.svelte'

  let {
    areas = [],
    cur = -1,
    onToggle,
    onLongPress,
    readonly = false,
    labels = { front: '', back: '' },
    heat,
    strokes = [],
    zoom = null,
    onStroke,
  }: {
    areas?: Area[]
    /** Index of the area being edited; its regions get an outline when there is more than one area. */
    cur?: number
    onToggle?: (id: string) => void
    onLongPress?: (id: string) => void
    readonly?: boolean
    labels?: { front: string; back: string }
    /** Heatmap mode: per-region mean intensity and weight (0..1) driving opacity. Overrides `areas`. */
    heat?: Map<string, { mean: number; weight: number }>
    /** Heatmap mode: strokes to shade over the figures, each with its level. Edit mode draws the areas' own. */
    strokes?: HeatStroke[]
    /** Drawing mode: one figure enlarged; one finger paints a stroke on the current area, two fingers pan and zoom. */
    zoom?: View | null
    onStroke?: (stroke: Stroke) => void
  } = $props()

  // Clip ids must be unique: Trends keeps its map mounted under the report's.
  const uid = $props.id()
  const fig = $derived(prefs.figure)
  const box = $derived(figureBox(fig))
  const full = $derived(isFull(areas))
  const fullColor = $derived(full ? intensityColor(areas.find((a) => a.regions.includes('*'))!.intensity) : '')
  const fill = $derived.by(() => {
    const m = new Map<string, string>()
    areas.forEach((a) => a.regions.forEach((r) => m.set(r, intensityColor(a.intensity))))
    return m
  })
  const outlined = $derived(new Set(areas.length > 1 && cur >= 0 ? (areas[cur]?.regions ?? []) : []))
  const views: View[] = ['front', 'back']
  /** Shading on a figure: the heatmap's strokes, or the areas' own in their colour. Only strokes drawn on this figure fit its coordinates. */
  const shading = (view: View): HeatStroke[] =>
    (heat ? strokes : areas.flatMap((a) => (a.strokes ?? []).map((s) => ({ ...s, intensity: a.intensity })))).filter((s) => s.view === view && s.fig === fig)

  // Long press: fire after a hold, then swallow the click that follows.
  const HOLD_MS = 450
  let timer: ReturnType<typeof setTimeout> | undefined
  let held = false
  function down(id: string) {
    held = false
    clearTimeout(timer)
    if (!onLongPress) return
    timer = setTimeout(() => {
      held = true
      onLongPress(id)
    }, HOLD_MS)
  }
  function cancel() {
    clearTimeout(timer)
  }
  function click(id: string) {
    if (held) {
      held = false
      return
    }
    onToggle?.(id)
  }
  /** Hit layer: smallest regions drawn last so they win over big neighbours. */
  const hits = (view: View): RegionDef[] => [...regionsFor(view)].sort((a, b) => shapeArea(shapeOf(fig, b)) - shapeArea(shapeOf(fig, a)))

  // Drawing mode. The svg's viewBox is its own pixel size, so client offsets are viewBox units and the
  // figure sits under one translate+scale. jsdom reports no size: fall back to a phone-ish box.
  const ZOOM = 2.5
  const ZOOM_RANGE = [1.5, 6]
  const MARGIN = 40
  let cw = $state(0)
  let ch = $state(0)
  const W = $derived(cw || 300)
  const H = $derived(ch || 320)
  const fitK = $derived(Math.min(W / box.w, H / box.h))
  let k = $state(1)
  let tx = $state(0)
  let ty = $state(0)
  const clampX = (v: number) => Math.max(Math.min(0, W - k * box.w) - MARGIN, Math.min(Math.max(0, W - k * box.w) + MARGIN, v))
  const clampY = (v: number) => Math.max(Math.min(0, H - k * box.h) - MARGIN, Math.min(Math.max(0, H - k * box.h) + MARGIN, v))
  // Entering drawing mode or switching figure looks at the current area; later strokes do not move the view.
  $effect(() => {
    if (!zoom) return
    const v = zoom
    const [w, h, kk, f] = [W, H, ZOOM * fitK, fig]
    const c = figureCenter(f, untrack(() => areas[cur]?.regions ?? []), v)
    k = kk
    tx = w / 2 - kk * c.x
    ty = h / 2 - kk * c.y
  })

  // Gestures: one pointer paints, two pan and pinch. A second finger cancels the stroke in progress,
  // and nothing paints again until every finger is up, so a pinch never leaves a smear behind.
  type P = { x: number; y: number }
  const pointers = new Map<number, P>()
  let painting = $state<[number, number][] | null>(null)
  let pinch: { mid: P; dist: number; k: number; tx: number; ty: number } | null = null
  let dead = false
  const figurePoint = (el: Element, x: number, y: number) => clientToFigure(el.getBoundingClientRect(), { k, tx, ty }, x, y)
  const mid = (): P => {
    const [a, b] = [...pointers.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
  const dist = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  function pdown(e: PointerEvent) {
    const el = e.currentTarget as Element
    el.setPointerCapture?.(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 2) {
      painting = null
      dead = true
      pinch = { mid: mid(), dist: dist(), k, tx, ty }
      return
    }
    if (pointers.size > 2 || dead) return
    if (e.button === 0) painting = [figurePoint(el, e.clientX, e.clientY)]
    else pinch = { mid: { x: e.clientX, y: e.clientY }, dist: 0, k, tx, ty }
  }
  function pmove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch) {
      const m = pointers.size === 2 ? mid() : { x: e.clientX, y: e.clientY }
      const scale = pointers.size === 2 && pinch.dist > 0 ? dist() / pinch.dist : 1
      const nk = Math.max(ZOOM_RANGE[0] * fitK, Math.min(ZOOM_RANGE[1] * fitK, pinch.k * scale))
      // Keep the point under the fingers' midpoint where it was.
      const fx = (pinch.mid.x - pinch.tx) / pinch.k
      const fy = (pinch.mid.y - pinch.ty) / pinch.k
      k = nk
      tx = clampX(m.x - fx * nk)
      ty = clampY(m.y - fy * nk)
      return
    }
    if (!painting) return
    const p = figurePoint(e.currentTarget as Element, e.clientX, e.clientY)
    const last = painting[painting.length - 1]
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1) painting = [...painting, p]
  }
  function pup(e: PointerEvent) {
    pointers.delete(e.pointerId)
    if (painting && pointers.size === 0) {
      onStroke?.({ fig, view: zoom!, points: painting, w: BRUSH })
      painting = null
    }
    if (pointers.size < 2) pinch = null
    if (pointers.size === 0) dead = false
  }
</script>

{#snippet shape(r: RegionDef, cls: string, extra: Record<string, unknown>)}
  <path class={cls} d={pathFor(shapeOf(fig, r))} {...extra} />
{/snippet}

{#snippet figure(view: View)}
  <!-- The union of the segments clips the strokes: a swipe past the edge stops at the skin. -->
  <clipPath id="{uid}-{view}">
    {#each regionsFor(view) as r (r.id)}<path d={pathFor(shapeOf(fig, r))} />{/each}
  </clipPath>
  <g class="paint">
    {#each regionsFor(view) as r (r.id)}
      {@const h = heat?.get(r.id)}
      {@const color = heat ? (h ? ic(h.mean) : undefined) : full ? fullColor : fill.get(r.id)}
      {@render shape(r, `region${color ? ' on' : ''}${outlined.has(r.id) ? ' hi' : ''}`, {
        'data-region': r.id,
        style: color ? `fill:${color}${h ? `;fill-opacity:${(0.35 + 0.65 * h.weight).toFixed(2)}` : ''}` : undefined,
      })}
    {/each}
  </g>
  <g class="strokes" class:heat={!!heat} clip-path="url(#{uid}-{view})">
    {#each shading(view) as s, i (i)}
      <path class="stroke" d={strokePath(s)} stroke={ic(s.intensity)} stroke-width={s.w} />
    {/each}
    {#if zoom === view && painting}
      <path class="stroke live" d={strokePath({ fig, view, points: painting, w: BRUSH })} stroke={intensityColor(areas[cur]?.intensity ?? 0)} stroke-width={BRUSH} />
    {/if}
  </g>
{/snippet}

{#if zoom}
  <div class="maps">
    <div class="figure zoomed" bind:clientWidth={cw} bind:clientHeight={ch}>
      <!-- A drawing surface: a finger paints, two fingers pan and zoom. Nothing here is reachable by keyboard; the regions are, on the ordinary map. -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <svg
        viewBox="0 0 {W} {H}"
        role="img"
        aria-label={labels[zoom]}
        data-k={k}
        data-tx={tx}
        data-ty={ty}
        onpointerdown={pdown}
        onpointermove={pmove}
        onpointerup={pup}
        onpointercancel={pup}
        oncontextmenu={(e) => e.preventDefault()}>
        <g transform="translate({tx} {ty}) scale({k})">
          {@render figure(zoom)}
        </g>
      </svg>
    </div>
  </div>
{:else}
  <div class="maps" class:readonly>
    {#each views as view (view)}
      <div class="figure">
        <svg viewBox="-4 -4 {box.w + 8} {box.h + 8}" role="group" aria-label={labels[view]}>
          {@render figure(view)}
          {#if !readonly}
            <g class="hits">
              {#each hits(view) as r (r.id)}
                {@render shape(r, 'hit', {
                  role: 'button',
                  'aria-pressed': full || fill.has(r.id),
                  'aria-label': regionLabel(r.id, t),
                  onclick: () => click(r.id),
                  onpointerdown: () => down(r.id),
                  onpointerup: cancel,
                  onpointercancel: cancel,
                  onpointerleave: cancel,
                  oncontextmenu: (e: Event) => e.preventDefault(),
                })}
              {/each}
            </g>
          {/if}
        </svg>
        {#if labels[view]}<span class="label">{labels[view]}</span>{/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .maps {
    display: flex;
    justify-content: center;
    gap: 8px;
    height: 100%;
    width: 100%;
  }
  .figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    height: 100%;
    flex: 0 1 50%;
    min-width: 0;
  }
  .figure.zoomed {
    flex: 1 1 100%;
    border-radius: 12px;
    background: var(--surface);
    overflow: hidden;
  }
  .zoomed svg {
    touch-action: none;
    cursor: crosshair;
  }
  svg {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: block;
    touch-action: manipulation;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-3);
    flex: none;
  }
  .paint, .strokes { pointer-events: none; }
  svg { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  /* Seams: thin, the CHOIR fingers are only a few units wide. */
  .region {
    fill: var(--surface-2);
    stroke: var(--bg);
    stroke-width: 1;
    transition: fill 0.12s;
  }
  .region.hi { stroke: var(--ink); stroke-width: 2; }
  /* Strokes sit on their region's colour: a darker edge keeps them legible on it. */
  .stroke { fill: none; stroke-linecap: round; stroke-linejoin: round; filter: brightness(0.8); }
  /* On the heatmap, overlap builds density. */
  .strokes.heat .stroke { opacity: 0.35; filter: none; }
  .hit {
    fill: transparent;
    stroke: transparent;
    stroke-width: 10;
    pointer-events: all;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
</style>
