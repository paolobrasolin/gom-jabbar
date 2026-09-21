<script lang="ts">
  import BodyMap from '../components/BodyMap.svelte'
  import DailyChart from '../components/DailyChart.svelte'
  import TagCompare from '../components/TagCompare.svelte'
  import Report from '../components/Report.svelte'
  import PresetLines from '../components/PresetLines.svelte'
  import { t, tl } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { rangeStart, dailySeries, summarize, regionHeat, tagComparison, symptomMeans, tagCounts, presetSeries, MIN_DAYS_PER_SIDE } from '../lib/stats'
  import { formatDuration } from '../lib/time'
  import { allStrokes } from '../lib/strokes'

  const RANGES = [7, 30, 90, 365]
  let days = $state(30)
  let showReport = $state(false)

  const from = $derived(rangeStart(days))
  const entries = live(() => days, () => db.entries.where('at').aboveOrEqual(from.toISOString()).toArray(), [])
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  const presets = live(() => null, () => db.presets.orderBy('order').toArray(), [])
  const byPreset = $derived(presetSeries(entries.value, presets.value))

  const series = $derived(dailySeries(entries.value, from, days))
  const summary = $derived(summarize(entries.value, days))
  const heat = $derived(regionHeat(entries.value, symptoms.value))
  const strokes = $derived(allStrokes(entries.value))
  const cmp = $derived(tagComparison(entries.value, tags.value))
  const symMeans = $derived(symptomMeans(entries.value, symptoms.value))
  const counts = $derived(tagCounts(entries.value, tags.value))
  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })
  const fmt1 = (v: number | null) => (v === null ? '–' : (Math.round(v * 10) / 10).toString())
</script>

<div class="screen">
  <div class="chips ranges">
    {#each RANGES as r (r)}
      <button class="chip small" aria-pressed={days === r} onclick={() => (days = r)}>{t('trends.range', { n: r })}</button>
    {/each}
  </div>

  {#if summary.entries === 0}
    <div class="card muted small">{t('trends.empty')}</div>
  {:else}
    <div class="tiles">
      <div class="card tile"><span class="small muted">{t('trends.entries')}</span><b>{summary.entries}</b><span class="small muted">{t('trends.onDays', { n: summary.daysWithEntries })}</span></div>
      <div class="card tile"><span class="small muted">{t('trends.meanPain')}</span><b>{fmt1(summary.meanPain)}</b><span class="small muted">{t('trends.maxPain', { n: summary.maxPain ?? '–' })}</span></div>
      <div class="card tile"><span class="small muted">{t('trends.badDays')}</span><b>{summary.daysAtLeast5}</b><span class="small muted">{t('trends.badDaysHint')}</span></div>
      <div class="card tile"><span class="small muted">{t('trends.episodes')}</span><b>{summary.episodes}</b><span class="small muted">{summary.meanEpisodeMs !== null ? t('trends.episodeMean', { d: formatDuration(summary.meanEpisodeMs, units) }) : ''}</span></div>
    </div>

    <div class="card">
      <p class="small muted label">{t('trends.heatmap')}</p>
      <div class="map"><BodyMap {heat} {strokes} readonly labels={{ front: t('log.front'), back: t('log.back') }} /></div>
      <p class="small muted">{t('trends.heatmapHint')}</p>
    </div>

    <div class="card">
      <p class="small muted label">{t('trends.overTime')}</p>
      <DailyChart {series} />
    </div>

    {#if byPreset.length}
      <div class="card">
        <p class="small muted label">{t('trends.presets')}</p>
        <PresetLines rows={byPreset} {from} {days} />
        <p class="small muted top">{t('trends.presetsHint')}</p>
      </div>
    {/if}

    <div class="card">
      <p class="small muted label">{t('trends.tags')}</p>
      {#if cmp.length}
        <TagCompare rows={cmp} />
        <p class="small muted top">{t('trends.descriptive')}</p>
      {:else}
        <p class="small muted">{t('trends.tagsNeedData', { n: MIN_DAYS_PER_SIDE })}</p>
        {#if counts.length}
          <div class="chips top">
            {#each counts as c (c.tag.id)}<span class="chip small outline">{tl(c.tag.label)} · {c.count}</span>{/each}
          </div>
        {/if}
      {/if}
    </div>

    {#if symMeans.length}
      <div class="card">
        <p class="small muted label">{t('trends.symptoms')}</p>
        <div class="sym">
          {#each symMeans as s (s.symptom.id)}
            <div class="row"><span class="name grow">{tl(s.symptom.label)}</span><span class="small muted">{t('trends.nEntries', { n: s.count })}</span><b class="val">{fmt1(s.mean)}</b></div>
          {/each}
        </div>
      </div>
    {/if}

    <button class="btn primary block" onclick={() => (showReport = true)}>{t('trends.report')}</button>
  {/if}
</div>

{#if showReport}
  <Report {days} {from} entries={entries.value} tags={tags.value} symptoms={symptoms.value} onclose={() => (showReport = false)} />
{/if}

<style>
  .ranges { flex-wrap: nowrap; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tile { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; }
  .tile b { font-size: 28px; line-height: 1.1; }
  .label { margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
  .map {
    height: 300px;
    /* Paper panel: heat opacity blends with a light ground in both themes. */
    --bg: #f6f4ef; --surface-2: #e4e1da; --ink-3: #8a8a92;
    background: var(--bg); border-radius: 12px; padding: 8px 8px 4px;
  }
  .top { margin-top: 10px; }
  .sym { display: flex; flex-direction: column; gap: 8px; }
  .val { font-variant-numeric: tabular-nums; min-width: 32px; text-align: right; }
</style>
