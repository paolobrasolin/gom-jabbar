<svelte:options namespace="svg" />

<!--
  One view of the body figure (§5.3), as SVG content for whatever svg holds it: the ordinary map, the
  drawing surface, a future fullscreen figure (#22). Regions coloured by their area or by the heat,
  the strokes shading them, the stroke in progress, and the tappable hit layer unless readonly.
-->
<script lang="ts">
  import { regionsFor, shapeArea, shapeOf, pathFor, REGION_BY_ID, type View, type RegionDef } from '../lib/regions'
  import { prefs } from '../lib/prefs.svelte'
  import { intensityColor } from '../lib/color'
  import { isFull, type Area } from '../lib/areas'
  import { regionLabel } from '../lib/regionLabel'
  import { strokePath, BRUSH, type HeatStroke } from '../lib/strokes'
  import { t } from '../i18n/index.svelte'

  let {
    view,
    areas = [],
    cur = -1,
    heat,
    strokes = [],
    live = null,
    liveColor = '',
    readonly = false,
    onToggle,
    onLongPress,
  }: {
    view: View
    areas?: Area[]
    /** Index of the area being edited; its regions get an outline when there is more than one area. */
    cur?: number
    /** Heatmap mode: per-region mean intensity and weight (0..1) driving opacity. Overrides `areas`. */
    heat?: Map<string, { mean: number; weight: number }>
    /** Heatmap mode: strokes to shade over the figure, each with its level. Otherwise the areas' own are drawn. */
    strokes?: HeatStroke[]
    /** The stroke being drawn right now, in figure coordinates, and its colour. */
    live?: [number, number][] | null
    liveColor?: string
    readonly?: boolean
    onToggle?: (id: string) => void
    onLongPress?: (id: string) => void
  } = $props()

  // Clip ids must be unique: Trends keeps its map mounted under the report's.
  const uid = $props.id()
  const fig = $derived(prefs.figure)
  const regions = $derived(regionsFor(view))
  const full = $derived(isFull(areas))
  const fullColor = $derived(full ? intensityColor(areas.find((a) => a.regions.includes('*'))!.intensity) : '')
  const fill = $derived.by(() => {
    const m = new Map<string, string>()
    areas.forEach((a) => a.regions.forEach((r) => m.set(r, intensityColor(a.intensity))))
    return m
  })
  const outlined = $derived(new Set(areas.length > 1 && cur >= 0 ? (areas[cur]?.regions ?? []) : []))
  /** Shading: the heatmap's strokes, or the areas' own in their colour. Only strokes drawn on this figure fit its coordinates. */
  const shading = $derived(
    (heat ? strokes : areas.flatMap((a) => (a.strokes ?? []).map((s) => ({ ...s, intensity: a.intensity })))).filter((s) => s.view === view && s.fig === fig),
  )
  /** Pieces by segment: each is clipped to its own, so a round cap never shows on a neighbour (§5.3). */
  const painted = $derived.by(() => {
    const m = new Map<string, HeatStroke[]>()
    for (const s of shading) m.set(s.region, [...(m.get(s.region) ?? []), s])
    // A piece whose segment this build does not know (a hand-edited file) is not drawn rather than breaking the map.
    return [...m].filter(([id]) => REGION_BY_ID[id]).map(([id, pieces]) => ({ id, shape: shapeOf(fig, REGION_BY_ID[id]), pieces }))
  })
  /** Hit layer: smallest regions drawn last so they win over big neighbours. */
  const hits = $derived([...regions].sort((a, b) => shapeArea(shapeOf(fig, b)) - shapeArea(shapeOf(fig, a))))

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
</script>

{#snippet hit(r: RegionDef, extra: Record<string, unknown>)}
  <path class="hit" d={pathFor(shapeOf(fig, r))} {...extra} />
{/snippet}

<!-- The silhouette clips the gesture in progress: a swipe past the edge stops at the skin. Saved pieces are clipped to their own segment. -->
<clipPath id="{uid}-clip">
  {#each regions as r (r.id)}<path d={pathFor(shapeOf(fig, r))} />{/each}
</clipPath>
{#each painted as g (g.id)}
  <clipPath id="{uid}-{g.id}"><path d={pathFor(g.shape)} /></clipPath>
{/each}
<g class="paint">
  {#each regions as r (r.id)}
    {@const h = heat?.get(r.id)}
    {@const color = heat ? (h ? intensityColor(h.mean) : undefined) : full ? fullColor : fill.get(r.id)}
    <path
      class="region{color ? ' on' : ''}{outlined.has(r.id) ? ' hi' : ''}"
      data-region={r.id}
      d={pathFor(shapeOf(fig, r))}
      style={color ? `fill:${color}${h ? `;fill-opacity:${(0.35 + 0.65 * h.weight).toFixed(2)}` : ''}` : undefined} />
  {/each}
</g>
<g class="strokes" class:heat={!!heat}>
  {#each painted as g (g.id)}
    <g clip-path="url(#{uid}-{g.id})">
      {#each g.pieces as s, i (i)}
        <path class="stroke" d={strokePath(s)} stroke={intensityColor(s.intensity)} stroke-width={s.w} />
      {/each}
    </g>
  {/each}
  {#if live}
    <path class="stroke live" d={strokePath({ points: live })} stroke={liveColor} stroke-width={BRUSH} clip-path="url(#{uid}-clip)" />
  {/if}
</g>
{#if !readonly}
  <g class="hits">
    {#each hits as r (r.id)}
      {@render hit(r, {
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

<style>
  .paint, .strokes { pointer-events: none; }
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
