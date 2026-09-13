<script lang="ts">
  import { t, locale } from '../i18n/index.svelte'
  import { intensityColor } from '../lib/color'
  import type { DayPoint } from '../lib/stats'

  let { series, height = 170, interactive = true }: { series: DayPoint[]; height?: number; interactive?: boolean } = $props()

  let width = $state(360)
  let sel = $state<number | null>(null)

  const padL = 22
  const padR = 8
  const padT = 10
  const padB = 22
  const plotW = $derived(Math.max(10, width - padL - padR))
  const plotH = $derived(height - padT - padB)
  const n = $derived(series.length)
  const slot = $derived(plotW / n)
  const barW = $derived(Math.min(24, Math.max(2, slot - 2)))
  const y = (v: number) => padT + plotH - (v / 10) * plotH
  const x = (i: number) => padL + i * slot + slot / 2

  /** Top-rounded column from the baseline. */
  function column(i: number, v: number): string {
    const h = Math.max(0, (v / 10) * plotH)
    const r = Math.min(4, barW / 2, h)
    const x0 = x(i) - barW / 2
    const top = y(v)
    const base = padT + plotH
    if (h === 0) return ''
    return `M ${x0} ${base} V ${top + r} Q ${x0} ${top} ${x0 + r} ${top} H ${x0 + barW - r} Q ${x0 + barW} ${top} ${x0 + barW} ${top + r} V ${base} Z`
  }

  /** Mean as a dot per day with data. Skipped on long ranges where dots would smear. */
  const showMean = $derived(n <= 100)
  const dotR = $derived(n <= 35 ? 4 : 3)

  const tickEvery = $derived(n <= 10 ? 1 : n <= 35 ? 7 : n <= 100 ? 14 : 30)
  const fmtTick = (d: Date) => new Intl.DateTimeFormat(locale(), n <= 10 ? { weekday: 'short' } : { day: 'numeric', month: 'short' }).format(d)
  const fmtFull = (d: Date) => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(d)
  const tooltip = $derived(sel !== null && series[sel] ? series[sel] : null)
</script>

<div class="chart" bind:clientWidth={width}>
  <div class="legend small muted">
    <span><i class="key bar"></i>{t('trends.legendMax')}</span>
    {#if showMean}<span><i class="key dot"></i>{t('trends.legendMean')}</span>{/if}
  </div>
  <svg {width} {height} role="img" aria-label={t('trends.chartLabel')}>
    {#each [0, 5, 10] as g (g)}
      <line class="grid" x1={padL} x2={width - padR} y1={y(g)} y2={y(g)} />
      <text class="tick" x={padL - 6} y={y(g) + 4} text-anchor="end">{g}</text>
    {/each}
    {#each series as p, i (p.day)}
      {#if p.max !== null}
        <path d={column(i, p.max)} fill={intensityColor(p.max)} />
      {/if}
      {#if i % tickEvery === 0 && (n <= 10 || i < n - tickEvery / 2)}
        <text class="tick" x={x(i)} y={height - 6} text-anchor="middle">{fmtTick(p.date)}</text>
      {/if}
      {#if interactive}
        <rect
          class="hit"
          role="button"
          tabindex="-1"
          aria-label={fmtFull(p.date)}
          x={padL + i * slot} y={padT} width={slot} height={plotH}
          onpointerdown={() => (sel = sel === i ? null : i)} />
      {/if}
    {/each}
    {#if showMean}
      {#each series as p, i (p.day)}
        {#if p.mean !== null}
          <circle class="mean" cx={x(i)} cy={y(p.mean)} r={dotR} />
        {/if}
      {/each}
    {/if}
    {#if tooltip}
      {@const i = sel!}
      <line class="cursor" x1={x(i)} x2={x(i)} y1={padT} y2={padT + plotH} />
    {/if}
  </svg>
  {#if tooltip}
    <div class="tip small" style="left: {Math.min(Math.max(x(sel!), 70), width - 70)}px">
      <b>{fmtFull(tooltip.date)}</b>
      {#if tooltip.max === null}
        <span class="muted">{t('trends.noEntries')}</span>
      {:else}
        <span>{t('trends.legendMax')} {tooltip.max} · {t('trends.legendMean')} {tooltip.mean!.toFixed(1)} · {t('trends.nEntries', { n: tooltip.count })}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .chart { position: relative; width: 100%; }
  svg { display: block; overflow: visible; }
  .legend { display: flex; gap: 14px; margin-bottom: 4px; }
  .key { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: -1px; border-radius: 2px; }
  .key.bar { background: var(--ink-3); }
  .key.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ink); border: 2px solid var(--surface); box-sizing: content-box; }
  .grid { stroke: var(--border); stroke-width: 1; }
  .tick { fill: var(--ink-3); font-size: 11px; }
  .mean { fill: var(--ink); stroke: var(--surface); stroke-width: 2; }
  .hit { fill: transparent; cursor: pointer; }
  .cursor { stroke: var(--ink-2); stroke-width: 1; }
  .tip {
    position: absolute; top: 18px; transform: translateX(-50%);
    background: var(--ink); color: var(--bg); padding: 6px 10px; border-radius: 8px;
    display: flex; flex-direction: column; gap: 2px; pointer-events: none; white-space: nowrap;
  }
  .tip .muted { color: var(--surface-2); }
</style>
