<script lang="ts">
  import BodyMap from './BodyMap.svelte'
  import DailyChart from './DailyChart.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import { t, tl, locale } from '../i18n/index.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { dailySeries, summarize, regionHeat, tagComparison, symptomMeans, tagCounts } from '../lib/stats'
  import { durationMs } from '../lib/entries'
  import { formatDuration, formatTime } from '../lib/time'
  import { PAIN, type Entry, type Symptom, type Tag } from '../lib/types'
  import { intensityColor, intensityInk } from '../lib/color'

  let { days, from, entries, tags, symptoms, onclose }: { days: number; from: Date; entries: Entry[]; tags: Tag[]; symptoms: Symptom[]; onclose: () => void } = $props()

  const to = $derived(new Date(from.getTime() + days * 86_400_000 - 1))
  const fmtDate = (d: Date) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  const fmtDay = (iso: string) => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
  const series = $derived(dailySeries(entries, from, days))
  const summary = $derived(summarize(entries, days))
  const heat = $derived(regionHeat(entries))
  const cmp = $derived(tagComparison(entries, tags))
  const counts = $derived(tagCounts(entries, tags))
  const symMeans = $derived(symptomMeans(entries, symptoms))
  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })
  const fmt1 = (v: number | null) => (v === null ? '–' : (Math.round(v * 10) / 10).toString())
  /** Compact chronological list: episodes and entries with notes. */
  const notable = $derived(entries.filter((e) => e.endedAt || e.ongoing || e.note).sort((a, b) => a.at.localeCompare(b.at)))

  $effect(() => {
    document.body.classList.add('printing')
    return () => document.body.classList.remove('printing')
  })
</script>

<div class="report">
  <div class="toolbar no-print">
    <button class="btn" onclick={onclose}>{t('common.close')}</button>
    <button class="btn primary grow" onclick={() => window.print()}>{t('report.print')}</button>
  </div>

  <article class="page">
    <header>
      <h1>{t('report.title')}</h1>
      <p class="muted">{t('report.range', { a: fmtDate(from), b: fmtDate(to) })} · {t('report.generated', { d: fmtDate(new Date()) })}</p>
    </header>

    <section class="grid4">
      <div><span class="k">{t('trends.entries')}</span><b>{summary.entries}</b><span class="k">{t('trends.onDays', { n: summary.daysWithEntries })}</span></div>
      <div><span class="k">{t('trends.meanPain')}</span><b>{fmt1(summary.meanPain)}</b><span class="k">{t('trends.maxPain', { n: summary.maxPain ?? '–' })}</span></div>
      <div><span class="k">{t('trends.badDays')}</span><b>{summary.daysAtLeast5}</b><span class="k">{t('trends.badDaysHint')}</span></div>
      <div><span class="k">{t('trends.episodes')}</span><b>{summary.episodes}</b><span class="k">{summary.meanEpisodeMs !== null ? t('trends.episodeMean', { d: formatDuration(summary.meanEpisodeMs, units) }) : ''}</span></div>
    </section>

    <section class="two">
      <div>
        <h2>{t('trends.heatmap')}</h2>
        <div class="map"><BodyMap {heat} readonly labels={{ front: t('log.front'), back: t('log.back') }} /></div>
      </div>
      <div>
        <h2>{t('trends.overTime')}</h2>
        <DailyChart {series} height={150} interactive={false} />
        {#if symMeans.length}
          <h2>{t('trends.symptoms')}</h2>
          <table>
            <tbody>
              {#each symMeans as s (s.symptom.id)}<tr><td>{tl(s.symptom.label)}</td><td class="num">{fmt1(s.mean)}</td><td class="num muted">{t('trends.nEntries', { n: s.count })}</td></tr>{/each}
            </tbody>
          </table>
        {/if}
      </div>
    </section>

    {#if counts.length}
      <section>
        <h2>{t('trends.tags')}</h2>
        <table>
          <thead><tr><th>{t('report.tag')}</th><th class="num">{t('report.times')}</th><th class="num">{t('trends.withTag')}</th><th class="num">{t('trends.withoutTag')}</th></tr></thead>
          <tbody>
            {#each counts as c (c.tag.id)}
              {@const r = cmp.find((x) => x.tag.id === c.tag.id)}
              <tr><td>{tl(c.tag.label)}</td><td class="num">{c.count}</td><td class="num">{r ? fmt1(r.withMean) : '–'}</td><td class="num">{r ? fmt1(r.withoutMean) : '–'}</td></tr>
            {/each}
          </tbody>
        </table>
        <p class="k">{t('trends.descriptive')}</p>
      </section>
    {/if}

    {#if notable.length}
      <section>
        <h2>{t('report.notable')}</h2>
        <table class="list">
          <tbody>
            {#each notable as e (e.id)}
              {@const pain = e.readings[PAIN] ?? 0}
              {@const dur = durationMs(e)}
              <tr>
                <td class="when">{fmtDay(e.at)} {formatTime(e.at, locale())}</td>
                <td class="num"><span class="pill" style="background: {intensityColor(pain)}; color: {intensityInk(pain)}">{pain}</span></td>
                <td>
                  <EntrySummary areas={e.areas} tags={e.tags} tagDefs={tags} />
                  {#if dur !== null}<span class="muted"> · {e.ongoing ? t('diary.ongoing') : formatDuration(dur, units)}</span>{/if}
                  {#if e.history?.length}<span class="muted"> · {[e.readings[PAIN], ...e.history.map((h) => h.pain)].join(' → ')}</span>{/if}
                  {#if e.note}<div class="note">{e.note}</div>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
  </article>
</div>

<style>
  .report {
    position: fixed; inset: 0; z-index: 60; overflow-y: auto;
    --bg: #ffffff; --surface: #ffffff; --surface-2: #ececea; --ink: #141416; --ink-2: #5c5c64; --ink-3: #9a9aa2; --border: #dcdcd8; --c-zero: #d5d5d1;
    background: var(--bg); color: var(--ink); color-scheme: light;
  }
  .toolbar { position: sticky; top: 0; display: flex; gap: 10px; padding: max(10px, env(safe-area-inset-top)) 12px 10px; background: var(--bg); border-bottom: 1px solid var(--border); z-index: 1; }
  .page { max-width: 760px; margin: 0 auto; padding: 16px 16px 40px; display: flex; flex-direction: column; gap: 18px; font-size: 13px; }
  h1 { font-size: 22px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-2); margin: 10px 0 6px; }
  .k { font-size: 11px; color: var(--ink-2); display: block; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .grid4 > div { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
  .grid4 b { font-size: 22px; display: block; line-height: 1.2; }
  .two { display: grid; grid-template-columns: 1fr 1.3fr; gap: 16px; }
  .map { height: 260px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 4px 6px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
  th { font-weight: 600; color: var(--ink-2); font-size: 11px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .when { white-space: nowrap; color: var(--ink-2); }
  .pill { min-width: 26px; height: 22px; font-size: 12px; }
  .note { color: var(--ink-2); font-style: italic; }
  @media (max-width: 520px) {
    .grid4 { grid-template-columns: 1fr 1fr; }
    .two { grid-template-columns: 1fr; }
  }
  @media print {
    .report { position: static; overflow: visible; }
    .no-print { display: none; }
    .page { max-width: none; padding: 0; }
    .two { grid-template-columns: 1fr 1.3fr; }
    .grid4 { grid-template-columns: repeat(4, 1fr); }
    section { break-inside: avoid; }
  }
</style>
