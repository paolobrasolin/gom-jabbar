<script lang="ts">
  import { regionsFor, shapeArea, shapeOf, pathFor, figureBox, MIND, MIND_SHAPE, type View, type RegionDef } from '../lib/regions'
  import { prefs } from '../lib/prefs.svelte'
  import { intensityColor } from '../lib/color'
  import { isFull, type Area } from '../lib/areas'
  import { intensityColor as ic } from '../lib/color'
  import { regionLabel } from '../lib/regionLabel'
  import { t } from '../i18n/index.svelte'

  let {
    areas = [],
    cur = -1,
    onToggle,
    onLongPress,
    readonly = false,
    labels = { front: '', back: '', mind: '' },
    heat,
  }: {
    areas?: Area[]
    /** Index of the area being edited; its regions get an outline when there is more than one area. */
    cur?: number
    onToggle?: (id: string) => void
    onLongPress?: (id: string) => void
    readonly?: boolean
    labels?: { front: string; back: string; mind?: string }
    /** Heatmap mode: per-region mean intensity and weight (0..1) driving opacity. Overrides `areas`. */
    heat?: Map<string, { mean: number; weight: number }>
  } = $props()

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
  /** The mind is one region of its own (§5.3): coloured by its area, or by the heat like any other. */
  const mindHeat = $derived(heat?.get(MIND))
  const mindColor = $derived(heat ? (mindHeat ? ic(mindHeat.mean) : undefined) : fill.get(MIND))
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
</script>

{#snippet shape(r: RegionDef, cls: string, extra: Record<string, unknown>)}
  <path class={cls} d={pathFor(shapeOf(fig, r))} {...extra} />
{/snippet}

{#snippet mind()}
  <div class="figure mind">
    <svg viewBox="-4 -4 {MIND_SHAPE.w + 8} {MIND_SHAPE.h + 8}" role="group" aria-label={labels.mind}>
      <g class="paint">
        <path
          class="region{mindColor ? ' on' : ''}{outlined.has(MIND) ? ' hi' : ''}"
          data-region={MIND}
          d={MIND_SHAPE.outline}
          style={mindColor ? `fill:${mindColor}${mindHeat ? `;fill-opacity:${(0.35 + 0.65 * mindHeat.weight).toFixed(2)}` : ''}` : undefined} />
        <path class="seam" d={MIND_SHAPE.seams} />
      </g>
      {#if !readonly}
        <g class="hits">
          <path
            class="hit"
            d={MIND_SHAPE.outline}
            role="button"
            tabindex="0"
            aria-pressed={fill.has(MIND)}
            aria-label={regionLabel(MIND, t)}
            onclick={() => onToggle?.(MIND)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle?.(MIND))} />
        </g>
      {/if}
    </svg>
    {#if labels.mind}<span class="label">{labels.mind}</span>{/if}
  </div>
{/snippet}

<div class="maps" class:readonly>
  {#each views as view (view)}
    <div class="figure">
      <svg viewBox="-4 -4 {box.w + 8} {box.h + 8}" role="group" aria-label={labels[view]}>
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
    {#if view === 'front'}{@render mind()}{/if}
  {/each}
</div>

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
  svg {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: block;
    touch-action: manipulation;
  }
  /* The mind sits between the two heads, in the air the columns leave there, and takes no room of its own: the bodies stay put. */
  .maps { position: relative; }
  .figure.mind { position: absolute; left: 50%; top: 0; transform: translateX(-50%); width: 20%; max-width: 80px; height: auto; justify-content: flex-start; }
  .figure.mind svg { flex: none; }
  .seam { fill: none; stroke: var(--bg); stroke-width: 1.5; stroke-linecap: round; }
  .label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-3);
    flex: none;
  }
  .paint { pointer-events: none; }
  svg { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  /* Seams: thin, the CHOIR fingers are only a few units wide. */
  .region {
    fill: var(--surface-2);
    stroke: var(--bg);
    stroke-width: 1;
    transition: fill 0.12s;
  }
  .region.hi { stroke: var(--ink); stroke-width: 2; }
  .hit {
    fill: transparent;
    stroke: transparent;
    stroke-width: 10;
    pointer-events: all;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
</style>
