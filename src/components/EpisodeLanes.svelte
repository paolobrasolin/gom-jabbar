<script lang="ts">
  import { PAD_L, PAD_R } from './DailyChart.svelte'
  import { t, tn, locale } from '../i18n/index.svelte'
  import { intensityColor } from '../lib/color'
  import { rangeDays, type EpisodeLane } from '../lib/stats'

  /**
   * The episodes over the range (§6.3, #120): one row per episode preset and one for the rest, each episode a bar over the
   * days it touched, in the colour of the level shown for it; then how many began per week, or per month on a long range.
   * The day columns are those of the charts (DailyChart), so a bar spans the days it would on the Quando chart.
   */
  let { lanes, counts, from, days }: { lanes: EpisodeLane[]; counts: { per: 'week' | 'month'; buckets: { start: Date; count: number }[] }; from: Date; days: number } = $props()

  let width = $state(360)
  const keys = $derived(rangeDays(from, days))
  const slot = $derived(Math.max(10, width - PAD_L - PAD_R) / days)
  const barW = $derived(Math.min(24, Math.max(2, slot - 2)))
  const x = (i: number) => PAD_L + i * slot + slot / 2
  const ROW = 12
  const GAP = 3

  const caption = $derived(t(counts.per === 'week' ? 'trends.perWeek' : 'trends.perMonth'))
  const max = $derived(Math.max(1, ...counts.buckets.map((b) => b.count)))
  const colW = $derived(Math.max(10, width - PAD_L - PAD_R) / counts.buckets.length)
  const COL_H = 40
  /** A label under every column while there is room for "30 set", else under every other. */
  const every = $derived(colW >= 48 ? 1 : 2)
  const fmt = (d: Date) => new Intl.DateTimeFormat(locale(), counts.per === 'week' ? { day: 'numeric', month: 'short' } : { month: 'short' }).format(d)
</script>

<div class="episodes" bind:clientWidth={width}>
  {#each lanes as lane (lane.preset?.id ?? '')}
    {@const h = lane.rows * (ROW + GAP)}
    <div class="lane">
      <div class="head"><span>{lane.preset?.name ?? t('trends.otherEpisodes')}</span><span class="muted">{tn('trends.episodeCount', lane.count)}</span></div>
      <svg {width} height={h + 2} aria-hidden="true">
        <line x1={PAD_L} x2={width - PAD_R} y1={h + 0.5} y2={h + 0.5} />
        {#each lane.bars as b (b.id)}
          <rect class="ep" data-from={keys[b.first]} data-to={keys[b.last]} x={x(b.first) - barW / 2} y={b.row * (ROW + GAP)} width={x(b.last) - x(b.first) + barW} height={ROW} rx={Math.min(3, barW / 2)} fill={intensityColor(b.level)} />
        {/each}
      </svg>
    </div>
  {/each}
  <p class="caption">{caption}</p>
  <svg {width} height={COL_H + 34} role="img" aria-label={caption}>
    {#each counts.buckets as b, i (i)}
      {@const cx = PAD_L + i * colW + colW / 2}
      {@const w = Math.min(18, colW - 4)}
      {@const top = 16 + COL_H - (b.count / max) * COL_H}
      <rect class="count" x={cx - w / 2} y={top} width={w} height={(b.count / max) * COL_H} rx="2" />
      <text class="n" x={cx} y={top - 4} text-anchor="middle">{b.count}</text>
      {#if i % every === 0}<text class="tick" x={cx} y={16 + COL_H + 16} text-anchor="middle">{fmt(b.start)}</text>{/if}
    {/each}
  </svg>
</div>

<style>
  .episodes { display: flex; flex-direction: column; gap: 6px; }
  .head { display: flex; justify-content: space-between; gap: 8px; font-size: 15px; }
  svg { display: block; }
  line { stroke: var(--border); stroke-width: 1; }
  .caption { margin-top: 6px; color: var(--ink-2); font-size: 15px; }
  .count { fill: var(--ink-2); }
  .n { fill: var(--ink); font-size: 12px; font-weight: 700; }
  .tick { fill: var(--ink-2); font-size: 12px; }
</style>
