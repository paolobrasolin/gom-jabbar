<!--
  Each day at its worst, level by level (§6.3, §7, #114): one bar per level 0–10 in the ramp's colours, as tall as the
  days whose worst reading of the symptom was that level, the count over it. Under it the median of those days and how
  many days read the symptom out of the range's. A mean to one decimal swings on one bad day; this is the range's shape.
-->
<script lang="ts">
  import { t, tn, num } from '../i18n/index.svelte'
  import { intensityColor } from '../lib/color'

  let { worst, median, days }: { worst: number[]; median: number | null; days: number } = $props()

  const top = $derived(Math.max(1, ...worst))
  const read = $derived(worst.reduce((a, b) => a + b, 0))
</script>

<ul class="hist" role="list" aria-label={t('trends.worst')}>
  {#each worst as n, level (level)}
    <li aria-label="{level}: {tn('diary.days', n)}">
      <span class="n" aria-hidden="true">{n || ''}</span>
      <span class="bar" aria-hidden="true" style="height: {(n / top) * 100}%; background: {intensityColor(level)}"></span>
      <span class="lv" aria-hidden="true">{level}</span>
    </li>
  {/each}
</ul>
<p class="line">{tn('trends.worstLine', read, { m: median === null ? '–' : num(median), d: days })}</p>

<style>
  .hist { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(11, 1fr); gap: 3px; height: 96px; }
  .hist li { display: grid; grid-template-rows: 16px 1fr 16px; align-items: end; min-width: 0; text-align: center; }
  .n { font-size: 11px; font-weight: 600; line-height: 16px; }
  /* A level no day reached keeps a hairline, so the scale reads whole. */
  .bar { display: block; min-height: 1px; border-radius: 2px 2px 0 0; align-self: end; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lv { font-size: 11px; line-height: 16px; color: var(--ink-2); border-top: 1px solid var(--border); }
  .line { margin: 6px 0 0; font-size: 13px; color: var(--ink-2); }
</style>
