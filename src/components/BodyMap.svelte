<script lang="ts">
  import BodyFigure from './BodyFigure.svelte'
  import { figureBox, MIND, MIND_SHAPE, type View } from '../lib/regions'
  import { prefs } from '../lib/prefs.svelte'
  import { intensityColor } from '../lib/color'
  import type { Area } from '../lib/areas'
  import { regionLabel } from '../lib/regionLabel'
  import type { HeatStroke } from '../lib/strokes'
  import { t } from '../i18n/index.svelte'

  let {
    areas = [],
    cur = -1,
    onToggle,
    onLongPress,
    readonly = false,
    labels = { front: '', back: '', mind: '' },
    heat,
    strokes = [],
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
    /** Heatmap mode: strokes to shade over the figures, each with its level. Edit mode draws the areas' own. */
    strokes?: HeatStroke[]
  } = $props()

  const box = $derived(figureBox(prefs.figure))
  const views: View[] = ['front', 'back']
  /** The mind is one region among the others (§5.3): coloured by its area, or by the heat like any other. */
  const mindArea = $derived(areas.find((a) => a.regions.includes(MIND)))
  const mindHeat = $derived(heat?.get(MIND))
  const mindColor = $derived(heat ? (mindHeat ? intensityColor(mindHeat.mean) : undefined) : mindArea ? intensityColor(mindArea.intensity) : undefined)
  const mindOutlined = $derived(areas.length > 1 && cur >= 0 && !!areas[cur]?.regions.includes(MIND))
</script>

{#snippet mind()}
  <div class="figure mind">
    <svg viewBox="-4 -4 {MIND_SHAPE.w + 8} {MIND_SHAPE.h + 8}" role="group" aria-label={labels.mind}>
      <g class="paint">
        <path
          class="region{mindColor ? ' on' : ''}{mindOutlined ? ' hi' : ''}"
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
            aria-pressed={!!mindArea}
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
        <BodyFigure {view} {areas} {cur} {heat} {strokes} {readonly} {onToggle} {onLongPress} />
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
  /* The mind's own shape, styled like a body region (BodyFigure.svelte). */
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
