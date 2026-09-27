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
  import { ringStyle } from '../lib/stats'
  import { isFull, type Layer } from '../lib/layers'
  import { layerLevel } from '../lib/summary'
  import { regionLabel } from '../lib/regionLabel'
  import { strokePath, BRUSH, type HeatStroke } from '../lib/strokes'
  import { t } from '../i18n/index.svelte'

  let {
    view,
    layers = [],
    cur = -1,
    heat,
    strokes = [],
    live = null,
    liveColor = '',
    readonly = false,
    onToggle,
  }: {
    view: View
    layers?: Layer[]
    /** Index of the layer being edited: its regions get an outline (all of them only when other layers are there to tell apart), and the other layers fade. */
    cur?: number
    /** Heatmap mode: per-region mean intensity, the fill, and weight (0..1, on a log scale, §6.3), the width of a ring inside the region. Overrides `layers`. */
    heat?: Map<string, { mean: number; weight: number }>
    /** Heatmap mode: strokes to shade over the figure, each with its level. Otherwise the layers' own are drawn. */
    strokes?: HeatStroke[]
    /** The stroke being drawn right now, in figure coordinates, and its colour. */
    live?: [number, number][] | null
    liveColor?: string
    readonly?: boolean
    onToggle?: (id: string) => void
  } = $props()

  // Clip ids must be unique: Trends keeps its map mounted under the report's.
  const uid = $props.id()
  const fig = $derived(prefs.figure)
  const regions = $derived(regionsFor(view))
  const current = $derived(cur >= 0 ? layers[cur] : undefined)
  const covers = (l: Layer, id: string) => isFull(l) || l.regions.includes(id)
  /** The colour of a region: the current layer's when it holds it, else the last other layer's (§5.4). */
  const fill = $derived.by(() => {
    const m = new Map<string, { color: string; ghost: boolean }>()
    for (const { id } of regions) {
      const own = current && covers(current, id) ? current : [...layers].reverse().find((l) => covers(l, id))
      if (own) m.set(id, { color: intensityColor(layerLevel(own)), ghost: layers.length > 1 && own !== current })
    }
    return m
  })
  /** A pale low level alone does not show where a tap landed: the current layer's regions are outlined (#23). The whole body alone needs no line round every segment. */
  const outlined = $derived(new Set(!current ? [] : isFull(current) ? (layers.length > 1 ? regions.map((r) => r.id) : []) : current.regions))
  /** Shading: the heatmap's strokes, or the layers' own in their colour. Only strokes drawn on this figure fit its coordinates. */
  const shading = $derived(
    (heat ? strokes : layers.flatMap((l) => (l.strokes ?? []).map((s) => ({ ...s, intensity: layerLevel(l), ghost: layers.length > 1 && l !== current })))).filter(
      (s) => s.view === view && s.fig === fig,
    ),
  )
  /** Pieces by segment: each is clipped to its own, so a round cap never shows on a neighbour (§5.3). */
  const painted = $derived.by(() => {
    const m = new Map<string, (HeatStroke & { ghost?: boolean })[]>()
    for (const s of shading) m.set(s.region, [...(m.get(s.region) ?? []), s])
    // A piece whose segment this build does not know (a hand-edited file) is not drawn rather than breaking the map.
    return [...m].filter(([id]) => REGION_BY_ID[id]).map(([id, pieces]) => ({ id, shape: shapeOf(fig, REGION_BY_ID[id]), pieces }))
  })
  /** Heatmap: frequency is the width of a ring inside the region, in screen px whatever the map's size. */
  const rings = $derived(
    heat
      ? regions
          .filter((r) => heat.has(r.id))
          .map((r) => ({ id: r.id, d: pathFor(shapeOf(fig, r)), clip: `${uid}-ring-${r.id}`, style: ringStyle(heat.get(r.id)!.weight) }))
      : [],
  )
  /** Hit layer: smallest regions drawn last so they win over big neighbours. */
  const hits = $derived([...regions].sort((a, b) => shapeArea(shapeOf(fig, b)) - shapeArea(shapeOf(fig, a))))

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
{#each rings as r (r.id)}
  <clipPath id={r.clip}><path d={r.d} /></clipPath>
{/each}
<g class="paint" class:heat={!!heat}>
  {#each regions as r (r.id)}
    {@const h = heat?.get(r.id)}
    {@const own = fill.get(r.id)}
    {@const color = heat ? (h ? intensityColor(h.mean) : undefined) : own?.color}
    <path
      class="region{color ? ' on' : ''}{outlined.has(r.id) ? ' hi' : ''}{!heat && own?.ghost ? ' ghost' : ''}"
      data-region={r.id}
      d={pathFor(shapeOf(fig, r))}
      style={color ? `fill:${color}` : undefined} />
  {/each}
</g>
<g class="strokes" class:heat={!!heat}>
  {#each painted as g (g.id)}
    <g clip-path="url(#{uid}-{g.id})">
      {#each g.pieces as s, i (i)}
        <path class="stroke" class:ghost={!!s.ghost} d={strokePath(s)} stroke={intensityColor(s.intensity)} stroke-width={s.w} />
      {/each}
    </g>
  {/each}
  {#if live}
    <path class="stroke live" d={strokePath({ points: live })} stroke={liveColor} stroke-width={BRUSH} clip-path="url(#{uid}-clip)" />
  {/if}
</g>
{#if rings.length}
  <!-- Twice the width, clipped to the region: only the inner half shows, so a ring never spills onto a neighbour. -->
  <g class="rings">
    {#each rings as r (r.id)}
      <path class="ring" data-ring={r.id} d={r.d} clip-path={`url(#${r.clip})`} style={r.style} />
    {/each}
  </g>
{/if}
{#if !readonly}
  <g class="hits">
    {#each hits as r (r.id)}
      {@render hit(r, {
        role: 'button',
        'aria-pressed': !!current && covers(current, r.id),
        'aria-label': regionLabel(r.id, t),
        onclick: () => onToggle?.(r.id),
        oncontextmenu: (e: Event) => e.preventDefault(),
      })}
    {/each}
  </g>
{/if}

<style>
  .paint, .strokes { pointer-events: none; }
  /* Seams: thin, the CHOIR fingers are only a few units wide, but drawn in the border grey so each segment reads as a target (#23). */
  .region {
    fill: var(--surface-2);
    stroke: var(--border);
    stroke-width: 1;
    transition: fill 0.12s;
  }
  .region.hi { stroke: var(--ink); stroke-width: 2; }
  /* Another layer's selection and paint: visible, but not what a tap edits. */
  .region.ghost { fill-opacity: 0.6; }
  .stroke.ghost { opacity: 0.6; }
  .rings { pointer-events: none; }
  .ring { fill: none; stroke: var(--ink); vector-effect: non-scaling-stroke; }
  /* Strokes sit on their region's colour: darker, so they read on it. */
  .stroke { fill: none; stroke-linecap: round; stroke-linejoin: round; filter: brightness(0.65); }
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
