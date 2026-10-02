<script lang="ts">
  import BodyMap from '../components/BodyMap.svelte'
  import RampKey from '../components/RampKey.svelte'
  import WorstDays from '../components/WorstDays.svelte'
  import DailyChart from '../components/DailyChart.svelte'
  import Report from '../components/Report.svelte'
  import PresetLines from '../components/PresetLines.svelte'
  import { tick } from 'svelte'
  import { t, tl, num, tn, locale } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live, reads } from '../lib/live.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { rangeStart, rangeEnd, dailySeries, summarize, regionHeat, fullBody, symptomMeans, symptomsRead, tagCounts, presetSeries, type Summary } from '../lib/stats'
  import { formatDuration } from '../lib/time'
  import { allStrokes } from '../lib/strokes'
  import { PAIN } from '../lib/types'

  const RANGES = [7, 30, 90, 365]
  let fixed = $state(30)
  /**
   * "Dal…" (§6.3, #114): a first day picked, the range running from it to today, for "since the last visit". A date
   * field's own value, YYYY-MM-DD, null while a fixed range is on.
   */
  let since = $state<string | null>(null)
  let picking = $state(false)
  let field = $state<HTMLInputElement>()
  let showReport = $state(false)

  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = rangeStart(1)
  const from = $derived.by(() => {
    if (!since) return rangeStart(fixed)
    const [y, m, d] = since.split('-').map(Number)
    return new Date(y, m - 1, d)
  })
  /** The range in calendar days, today included: rounded, since a clock change makes one day 23 or 25 hours long. */
  const days = $derived(since ? Math.round((today.getTime() - from.getTime()) / 86_400_000) + 1 : fixed)
  // The range ends with today, as the chart does: an entry dated later (a clock set wrong, a phone ahead in time) is in none (#114).
  const entries = live(() => [fixed, since], () => db.entries.where('at').between(from.toISOString(), rangeEnd(from, days).toISOString(), true, true).toArray(), [])

  /** "Dal…": the date field under the ranges, its picker opened at once where the browser can (Chrome). */
  async function pickSince() {
    picking = !picking
    if (!picking) return
    await tick()
    try {
      field?.showPicker?.()
    } catch {
      /* not allowed here: the field is in view, a tap opens it */
    }
  }
  function onSince(e: Event) {
    const v = (e.target as HTMLInputElement).value
    if (!v || v > ymd(today)) return
    since = v
    picking = false
  }
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  const presets = live(() => null, () => db.presets.orderBy('order').toArray(), [])
  /** The heads of episodes begun before the range with updates in it: an update counts for its head's preset (§6.3). */
  const outside = $derived.by(() => {
    const ids = new Set(entries.value.map((e) => e.id))
    return [...new Set(entries.value.flatMap((e) => (e.episodeId && !ids.has(e.episodeId) ? [e.episodeId] : [])))]
  })
  const earlier = live(() => outside, async () => (await db.entries.bulkGet(outside)).filter((e) => e !== undefined), [])
  const byPreset = $derived(presetSeries(entries.value, presets.value, earlier.value, symptoms.value))

  /**
   * The screen reads one symptom at a time (§6.3, #38): the tiles, the map, the chart and the tag comparison. The picker
   * offers every symptom read in range, in the editor's order, and opens on the first.
   */
  const choices = $derived(symptomsRead(entries.value, symptoms.value))
  let picked = $state<string | null>(null)
  const symptom = $derived(choices.find((s) => s.id === picked) ?? choices[0])
  const sid = $derived(symptom?.id ?? PAIN)
  const series = $derived(dailySeries(entries.value, from, days, sid))
  const summary = $derived(summarize(entries.value, days, sid))
  const symMeans = $derived(symptomMeans(entries.value, symptoms.value, sid))
  /** The symptom's figures only when something in range reads it: an entry without the reading is not a 0 (#36). */
  const read = $derived(summary.mean !== null)
  const heat = $derived(regionHeat(entries.value, sid))
  /** Full body is no region of the map: it is said beside it (#114). */
  const whole = $derived(fullBody(entries.value, sid))
  const strokes = $derived(allStrokes(entries.value, sid))
  const counts = $derived(tagCounts(entries.value, tags.value))
  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })
  const fmt1 = (v: number | null) => (v === null ? '–' : num(v))
  /** Under the episode count: the median length of the ended ones, and how many are still going on (§6.3). */
  const episodeLine = (s: Summary) =>
    [s.medianEpisodeMs !== null ? t('trends.episodeMedian', { d: formatDuration(s.medianEpisodeMs, units) }) : '', s.ongoing ? tn('episode.count', s.ongoing) : ''].filter(Boolean).join(' · ')
</script>

<div class="screen">
  <div class="chips ranges">
    {#each RANGES as r (r)}
      <button class="chip small" aria-pressed={!since && fixed === r} onclick={() => ((fixed = r), (since = null), (picking = false))}>{t('trends.range', { n: r })}</button>
    {/each}
    <button class="chip small" aria-pressed={!!since} onclick={pickSince}>
      {since ? t('trends.since', { d: new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(from) }) : t('trends.sinceChip')}
    </button>
  </div>
  {#if picking}
    <input class="since" bind:this={field} type="date" aria-label={t('trends.sinceLabel')} max={ymd(today)} value={since ?? ''} onchange={onSince} />
  {/if}

  {#if summary.entries === 0}
    <!-- Nothing read is not nothing logged: after a failed read the app's notice says so (§4.1). -->
    {#if !reads.failed}<div class="card muted small">{t('trends.empty')}</div>{/if}
  {:else}
    <!-- Before a visit the report is the point (#114): it comes first, under the ranges. -->
    <button class="btn primary block" onclick={() => (showReport = true)}>{t('trends.report')}</button>

    {#if choices.length}
      <div class="chips pick" role="group" aria-label={t('trends.heatSymptom')}>
        {#each choices as s (s.id)}
          <button class="chip small" aria-pressed={sid === s.id} onclick={() => (picked = s.id)}>{tl(s.label)}</button>
        {/each}
      </div>
    {/if}

    <div class="tiles">
      <div class="card tile"><span class="small muted">{t('trends.entries')}</span><b>{summary.entries}</b><span class="small muted">{tn('trends.onDays', summary.daysWithEntries)}</span></div>
      {#if read}
        <div class="card tile"><span class="small muted">{t('trends.mean')}</span><b>{fmt1(summary.mean)}</b><span class="small muted">{t('trends.maxPain', { n: summary.max ?? '–' })}</span></div>
      {/if}
      <div class="card tile"><span class="small muted">{t('trends.episodes')}</span><b>{summary.episodes}</b><span class="small muted">{episodeLine(summary)}</span></div>
    </div>

    {#if read}
      <div class="card">
        <p class="small muted label">{t('trends.worst')}</p>
        <WorstDays worst={summary.worst} median={summary.median} {days} />
      </div>
    {/if}

    <div class="card">
      <p class="small muted label">{t('trends.heatmap')}</p>
      <div class="map"><BodyMap {heat} {strokes} labels={{ front: t('log.front'), back: t('log.back') }} /></div>
      <RampKey />
      {#if whole}<p class="small">{tn('trends.fullBody', whole.count, { m: num(whole.mean) })}</p>{/if}
      <p class="small muted">{t('trends.heatmapHint')}</p>
    </div>

    {#if read && symptom}
      <div class="card">
        <p class="small muted label">{t('trends.overTime')}</p>
        <DailyChart {series} label={t('trends.chartLabel', { name: tl(symptom.label) })} />
      </div>
    {/if}

    {#if byPreset.length}
      <div class="card">
        <p class="small muted label">{t('trends.presets')}</p>
        <PresetLines rows={byPreset} {from} {days} />
        <p class="small muted top">{t('trends.presetsHint')}</p>
      </div>
    {/if}

    <!-- Tag use in days (§6.3). No comparison of days with and without: it could not be read honestly (#114, #120). -->
    {#if counts.length}
      <div class="card">
        <p class="small muted label">{t('trends.tags')}</p>
        <div class="chips">
          {#each counts as c (c.tag.id)}<span class="chip small outline">{tl(c.tag.label)} · {tn('diary.days', c.days)}</span>{/each}
        </div>
      </div>
    {/if}

    {#if symMeans.length}
      <div class="card">
        <p class="small muted label">{t('trends.symptoms')}</p>
        <div class="sym">
          {#each symMeans as s (s.symptom.id)}
            <div class="row"><span class="name grow">{tl(s.symptom.label)}</span><span class="small muted">{tn('diary.days', s.count)}</span><b class="val">{fmt1(s.mean)}</b></div>
          {/each}
        </div>
      </div>
    {/if}

  {/if}
</div>

{#if showReport}
  <Report {days} {from} entries={entries.value} tags={tags.value} symptoms={symptoms.value} symptom={symptom?.id} onclose={() => (showReport = false)} />
{/if}

<style>
  /* Five chips: the row wraps, so none is ever out of sight, the picked day least of all. */
  .ranges { flex: none; flex-wrap: wrap; }
  .since { font: inherit; padding: 10px 12px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--surface); color: var(--ink); }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  /* Three tiles: the last takes the whole row rather than leaving a hole. */
  .tile:last-child:nth-child(odd) { grid-column: span 2; }
  .tile { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; }
  .tile b { font-size: 28px; line-height: 1.1; }
  .label { margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
  /* The theme's own ground: a cream panel in the dark theme glared in a dark room, and with every region with data edged the ramp reads on either (#23). */
  .map {
    height: 300px;
    background: var(--bg); border-radius: 12px; padding: 8px 8px 4px;
  }
  .top { margin-top: 10px; }
  /* A scrolling row in the screen's column: without `flex: none` it may shrink to nothing. */
  .pick { flex: none; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .pick::-webkit-scrollbar { display: none; }
  .sym { display: flex; flex-direction: column; gap: 8px; }
  .val { font-variant-numeric: tabular-nums; min-width: 32px; text-align: right; }
</style>
