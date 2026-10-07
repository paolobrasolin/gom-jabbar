<!--
  How much (§6.3, §7, #114, #120): each day once at its highest reading of the symptom. First four figures in the
  tiles' layout, the lowest of those days, their median, the highest, and how many days read it out of the range's; then
  one bar per level 0–10 in the ramp's colours, as tall as the days at that level, the count over it; then what the bars
  count. The scale is ordinal: no mean, which swings on one bad day.
-->
<script lang="ts">
  import { t, tn, num } from '../i18n/index.svelte'
  import { intensityColor } from '../lib/color'

  let { worst, median, days }: { worst: number[]; median: number | null; days: number } = $props()

  const top = $derived(Math.max(1, ...worst))
  const read = $derived(worst.reduce((a, b) => a + b, 0))
  const lowest = $derived(worst.findIndex((n) => n > 0))
  const highest = $derived(worst.findLastIndex((n) => n > 0))
  const fig = (v: number | null) => (v === null || v < 0 ? '–' : num(v))
</script>

<div class="figs">
  <div><span class="k">{t('trends.lowest')}</span><b>{fig(lowest)}</b></div>
  <div><span class="k">{t('trends.median')}</span><b>{fig(median)}</b></div>
  <div><span class="k">{t('trends.highest')}</span><b>{fig(highest)}</b></div>
  <div><span class="k">{t('trends.daysRead')}</span><b>{read}<span class="of">/{days}</span></b></div>
</div>
<ul class="hist" role="list" aria-label={t('trends.worst')}>
  {#each worst as n, level (level)}
    <li aria-label="{level}: {tn('diary.days', n)}">
      <span class="n" aria-hidden="true">{n || ''}</span>
      <span class="bar" aria-hidden="true" style="height: {(n / top) * 100}%; background: {intensityColor(level)}"></span>
      <span class="lv" aria-hidden="true">{level}</span>
    </li>
  {/each}
</ul>
<p class="line">{t('trends.worst')}</p>

<style>
  .figs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .figs > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .k { font-size: 15px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .figs b { font-size: 28px; line-height: 1.1; }
  .of { font-size: 17px; font-weight: 400; color: var(--ink-2); }
  .hist { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(11, 1fr); gap: 3px; height: 96px; }
  .hist li { display: grid; grid-template-rows: 16px 1fr 16px; align-items: end; min-width: 0; text-align: center; }
  .n { font-size: 11px; font-weight: 600; line-height: 16px; }
  /* A level no day reached keeps a hairline, so the scale reads whole. */
  .bar { display: block; min-height: 1px; border-radius: 2px 2px 0 0; align-self: end; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lv { font-size: 11px; line-height: 16px; color: var(--ink-2); border-top: 1px solid var(--border); }
  .line { margin: 6px 0 0; font-size: 15px; color: var(--ink-2); }
</style>
