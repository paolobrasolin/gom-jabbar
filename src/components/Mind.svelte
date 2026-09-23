<!--
  The mind (§5.3): a brain seen from above, selectable like a region and coloured like one, by the
  current layer, faded when only another layer holds it, or by the heat.
-->
<script lang="ts">
  import { MIND, MIND_SHAPE } from '../lib/regions'
  import { intensityColor } from '../lib/color'
  import type { Layer } from '../lib/layers'
  import { layerLevel } from '../lib/summary'
  import { regionLabel } from '../lib/regionLabel'
  import { t } from '../i18n/index.svelte'

  let {
    layers = [],
    cur = -1,
    heat,
    readonly = false,
    label = '',
    onToggle,
  }: {
    layers?: Layer[]
    cur?: number
    /** Heatmap mode: mean intensity and weight (0..1) driving opacity. Overrides `layers`. */
    heat?: Map<string, { mean: number; weight: number }>
    readonly?: boolean
    label?: string
    onToggle?: (id: string) => void
  } = $props()

  const mindCur = $derived(cur >= 0 && !!layers[cur]?.regions.includes(MIND))
  const mindLayer = $derived(mindCur ? layers[cur] : layers.find((l) => l.regions.includes(MIND)))
  const mindHeat = $derived(heat?.get(MIND))
  const color = $derived(heat ? (mindHeat ? intensityColor(mindHeat.mean) : undefined) : mindLayer ? intensityColor(layerLevel(mindLayer)) : undefined)
  const outlined = $derived(layers.length > 1 && mindCur)
  const ghost = $derived(!heat && layers.length > 1 && !!mindLayer && !mindCur)
</script>

<div class="figure">
  <svg viewBox="-4 -4 {MIND_SHAPE.w + 8} {MIND_SHAPE.h + 8}" role="group" aria-label={label}>
    <g class="paint">
      <path
        class="region{color ? ' on' : ''}{outlined ? ' hi' : ''}{ghost ? ' ghost' : ''}"
        data-region={MIND}
        d={MIND_SHAPE.outline}
        style={color ? `fill:${color}${mindHeat ? `;fill-opacity:${(0.35 + 0.65 * mindHeat.weight).toFixed(2)}` : ''}` : undefined} />
      <path class="seam" d={MIND_SHAPE.seams} />
    </g>
    {#if !readonly}
      <g class="hits">
        <path
          class="hit"
          d={MIND_SHAPE.outline}
          role="button"
          tabindex="0"
          aria-pressed={mindCur}
          aria-label={regionLabel(MIND, t)}
          onclick={() => onToggle?.(MIND)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onToggle?.(MIND))} />
      </g>
    {/if}
  </svg>
  {#if label}<span class="label">{label}</span>{/if}
</div>

<style>
  .figure { display: flex; flex-direction: column; align-items: center; gap: 0; }
  svg { width: 100%; display: block; touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .seam { fill: none; stroke: var(--bg); stroke-width: 1.5; stroke-linecap: round; }
  .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-2); flex: none; }
  .paint { pointer-events: none; }
  /* Styled like a body region (BodyFigure.svelte). */
  .region { fill: var(--surface-2); stroke: var(--bg); stroke-width: 1; transition: fill 0.12s; }
  .region.hi { stroke: var(--ink); stroke-width: 2; }
  .region.ghost { fill-opacity: 0.4; }
  .hit { fill: transparent; stroke: transparent; stroke-width: 10; pointer-events: all; cursor: pointer; -webkit-tap-highlight-color: transparent; }
</style>
