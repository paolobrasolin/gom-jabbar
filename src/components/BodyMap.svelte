<script lang="ts">
  import { regionsFor, VIEWBOX, type View } from '../lib/regions'
  import { intensityColor } from '../lib/color'
  import { isFull, type Area } from '../lib/areas'

  let {
    areas = [],
    cur = -1,
    onToggle,
    readonly = false,
    labels = { front: '', back: '' },
  }: {
    areas?: Area[]
    /** Index of the area being edited; its regions get an outline when there is more than one area. */
    cur?: number
    onToggle?: (id: string) => void
    readonly?: boolean
    labels?: { front: string; back: string }
  } = $props()

  const full = $derived(isFull(areas))
  const fullColor = $derived(full ? intensityColor(areas.find((a) => a.regions.includes('*'))!.intensity) : '')
  const fill = $derived.by(() => {
    const m = new Map<string, string>()
    areas.forEach((a) => a.regions.forEach((r) => m.set(r, intensityColor(a.intensity))))
    return m
  })
  const outlined = $derived(new Set(areas.length > 1 && cur >= 0 ? (areas[cur]?.regions ?? []) : []))
  const views: View[] = ['front', 'back']
</script>

<div class="maps" class:readonly>
  {#each views as view (view)}
    <div class="figure">
      <svg viewBox="0 0 {VIEWBOX.w} {VIEWBOX.h}" role="group" aria-label={labels[view]}>
        {#each regionsFor(view) as r (r.id)}
          {@const color = full ? fullColor : fill.get(r.id)}
          {@const on = !!color}
          {@const hi = outlined.has(r.id)}
          {#if r.shape.kind === 'rect'}
            <rect
              class="region" class:on class:hi data-region={r.id}
              style:fill={color}
              x={r.shape.x} y={r.shape.y} width={r.shape.w} height={r.shape.h} rx={r.shape.rx}
              role={readonly ? undefined : 'button'} aria-pressed={readonly ? undefined : on} aria-label={r.id}
              onclick={() => !readonly && onToggle?.(r.id)} />
          {:else}
            <ellipse
              class="region" class:on class:hi data-region={r.id}
              style:fill={color}
              cx={r.shape.cx} cy={r.shape.cy} rx={r.shape.rx} ry={r.shape.ry}
              role={readonly ? undefined : 'button'} aria-pressed={readonly ? undefined : on} aria-label={r.id}
              onclick={() => !readonly && onToggle?.(r.id)} />
          {/if}
        {/each}
      </svg>
      {#if labels[view]}<span class="label">{labels[view]}</span>{/if}
    </div>
  {/each}
</div>

<style>
  .maps {
    display: flex;
    justify-content: center;
    gap: 12px;
    height: 100%;
    width: 100%;
  }
  .figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
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
  .label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-3);
    flex: none;
  }
  .region {
    fill: var(--surface-2);
    stroke: var(--bg);
    stroke-width: 2;
    transition: fill 0.12s;
  }
  .maps:not(.readonly) .region { cursor: pointer; }
  .region.hi { stroke: var(--ink); stroke-width: 4; }
</style>
