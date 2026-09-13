<script lang="ts">
  import { regionsFor, shapeArea, VIEWBOX, type View, type RegionDef } from '../lib/regions'
  import { intensityColor } from '../lib/color'
  import { isFull, type Area } from '../lib/areas'

  let {
    areas = [],
    cur = -1,
    onToggle,
    onLongPress,
    readonly = false,
    labels = { front: '', back: '' },
  }: {
    areas?: Area[]
    /** Index of the area being edited; its regions get an outline when there is more than one area. */
    cur?: number
    onToggle?: (id: string) => void
    onLongPress?: (id: string) => void
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
  const C = VIEWBOX.w / 2
  /** Hit layer: smallest regions drawn last so they win over big neighbours. */
  const hits = (view: View): RegionDef[] => [...regionsFor(view)].sort((a, b) => shapeArea(b.shape) - shapeArea(a.shape))
</script>

{#snippet shape(r: RegionDef, cls: string, extra: Record<string, unknown>)}
  {#if r.shape.kind === 'rect'}
    <rect class={cls} x={r.shape.x} y={r.shape.y} width={r.shape.w} height={r.shape.h} rx={r.shape.rx} {...extra} />
  {:else}
    <ellipse class={cls} cx={r.shape.cx} cy={r.shape.cy} rx={r.shape.rx} ry={r.shape.ry} {...extra} />
  {/if}
{/snippet}

<div class="maps" class:readonly>
  {#each views as view (view)}
    <div class="figure">
      <svg viewBox="-4 -4 {VIEWBOX.w + 8} {VIEWBOX.h + 8}" role="group" aria-label={labels[view]}>
        <g class="paint">
          {#each regionsFor(view) as r (r.id)}
            {@const color = full ? fullColor : fill.get(r.id)}
            {@render shape(r, `region${color ? ' on' : ''}${outlined.has(r.id) ? ' hi' : ''}`, { 'data-region': r.id, style: color ? `fill:${color}` : undefined })}
          {/each}
          {#if view === 'front'}
            <circle class="deco" cx={C - 8} cy="24" r="2.6" /><circle class="deco" cx={C + 8} cy="24" r="2.6" />
          {:else}
            <ellipse class="deco hair" cx={C} cy="17" rx="23" ry="15" /><ellipse class="deco hair" cx={C} cy="50" rx="7" ry="10" />
          {/if}
        </g>
        {#if !readonly}
          <g class="hits">
            {#each hits(view) as r (r.id)}
              {@render shape(r, 'hit', {
                role: 'button',
                'aria-pressed': full || fill.has(r.id),
                'aria-label': r.id,
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
  .label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-3);
    flex: none;
  }
  .paint { pointer-events: none; }
  .deco { fill: var(--bg); }
  .deco.hair { fill: var(--ink); opacity: 0.22; }
  svg { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .region {
    fill: var(--surface-2);
    stroke: var(--bg);
    stroke-width: 2;
    transition: fill 0.12s;
  }
  .region.hi { stroke: var(--ink); stroke-width: 3; }
  .hit {
    fill: transparent;
    stroke: transparent;
    stroke-width: 10;
    pointer-events: all;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
</style>
