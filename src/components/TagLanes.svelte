<script lang="ts">
  import Fold from './Fold.svelte'
  import { PAD_L, PAD_R } from './DailyChart.svelte'
  import { t, tl, tn } from '../i18n/index.svelte'
  import { rangeDays } from '../lib/stats'
  import type { Tag } from '../lib/types'

  /**
   * The tags over time (§6.3, #120): under the chart, on its days, one row per tag used in range with a mark on each
   * day it was, grouped medications, remedies, context, each group a fold closed until tapped. Nothing is compared or
   * computed: when, never what it did (#114).
   */
  let { counts, from, days }: { counts: { tag: Tag; days: number; on: string[] }[]; from: Date; days: number } = $props()

  let width = $state(360)
  const index = $derived(new Map(rangeDays(from, days).map((k, i) => [k, i])))
  // The chart's own geometry (DailyChart), so each mark is centred under its day's column.
  const slot = $derived(Math.max(10, width - PAD_L - PAD_R) / days)
  const markW = $derived(Math.min(24, Math.max(2, slot - 2)))
  const x = (i: number) => PAD_L + i * slot + slot / 2
  const GROUPS: Tag['group'][] = ['medication', 'intervention', 'context']
  const groups = $derived(GROUPS.map((g) => ({ g, rows: counts.filter((c) => c.tag.group === g) })).filter((x) => x.rows.length))
</script>

<div class="lanes" bind:clientWidth={width}>
  {#each groups as { g, rows } (g)}
    <Fold label={`${t(`tag.group.${g}`)} (${rows.length})`} summary={rows.map((r) => `${tl(r.tag.label)} ${r.days}`).join(' · ')}>
      <div class="rows">
        {#each rows as r (r.tag.id)}
          <div class="lane">
            <div class="head"><span>{tl(r.tag.label)}</span><span class="muted">{tn('diary.days', r.days)}</span></div>
            <svg {width} height="14" aria-hidden="true">
              <line x1={PAD_L} x2={width - PAD_R} y1="12.5" y2="12.5" />
              {#each r.on as day (day)}
                {#if index.has(day)}
                  <rect class="mark" data-day={day} x={x(index.get(day)!) - markW / 2} y="2" width={markW} height="10" rx={Math.min(2, markW / 2)} />
                {/if}
              {/each}
            </svg>
          </div>
        {/each}
      </div>
    </Fold>
  {/each}
</div>

<style>
  .rows { display: flex; flex-direction: column; gap: 6px; padding-bottom: 10px; }
  .head { display: flex; justify-content: space-between; gap: 8px; font-size: 15px; }
  svg { display: block; }
  line { stroke: var(--border); stroke-width: 1; }
  .mark { fill: var(--ink-2); }
</style>
