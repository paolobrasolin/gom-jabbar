<script lang="ts">
  import { intensityColor } from '../lib/color'
  import type { PresetPoint } from '../lib/stats'
  import type { Preset } from '../lib/types'

  let { rows, from, days }: { rows: { preset: Preset; points: PresetPoint[] }[]; from: Date; days: number } = $props()

  let width = $state(360)
  const height = 64
  const padL = 22
  const padR = 10
  const padT = 8
  const padB = 6
  const plotW = $derived(Math.max(10, width - padL - padR))
  const plotH = height - padT - padB
  const span = $derived(days * 86_400_000)
  const x = (at: number) => padL + Math.min(1, Math.max(0, (at - from.getTime()) / span)) * plotW
  const y = (v: number) => padT + plotH - (v / 10) * plotH
</script>

<div class="lines" bind:clientWidth={width}>
  {#each rows as r (r.preset.id)}
    {@const lastPoint = r.points[r.points.length - 1]}
    <div class="prow">
      <div class="small head"><span class="muted">{r.preset.name}</span><b>{lastPoint.value}</b></div>
      <svg {width} {height} role="img" aria-label={r.preset.name}>
        {#each [0, 5, 10] as g (g)}
          <line class="grid" x1={padL} x2={width - padR} y1={y(g)} y2={y(g)} />
          <text class="tick" x={padL - 6} y={y(g) + 4} text-anchor="end">{g}</text>
        {/each}
        {#if r.points.length > 1}
          <polyline class="line" points={r.points.map((p) => `${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')} />
        {/if}
        {#each r.points as p, i (i)}
          <circle cx={x(p.at)} cy={y(p.value)} r="4" fill={intensityColor(p.value)} class="dot" />
        {/each}
      </svg>
    </div>
  {/each}
</div>

<style>
  .lines { display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .head { display: flex; justify-content: space-between; margin-bottom: 2px; }
  svg { display: block; overflow: visible; }
  .grid { stroke: var(--border); stroke-width: 1; }
  .tick { fill: var(--ink-3); font-size: 11px; }
  .line { fill: none; stroke: var(--ink-3); stroke-width: 1.5; }
  .dot { stroke: var(--surface); stroke-width: 1.5; }
</style>
