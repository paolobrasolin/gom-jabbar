<script lang="ts">
  import BodyMap from './BodyMap.svelte'
  import RampKey from './RampKey.svelte'
  import WorstDays from './WorstDays.svelte'
  import DailyChart from './DailyChart.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import { t, tl, locale, num, tn } from '../i18n/index.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { dailySeries, summarize, regionHeat, fullBody, symptomMedians, symptomsRead, tagCounts, rangeEnd, type Summary } from '../lib/stats'
  import { durationMs, episodesOf, isHead, isUpdate, isActive, shownReading, chainLayers } from '../lib/entries'
  import { allStrokes } from '../lib/strokes'
  import { formatDuration, formatTime } from '../lib/time'
  import { PAIN, type Entry, type Symptom, type Tag, type TagGroup } from '../lib/types'
  import { entryHeadline, symptomName, trail, isRead } from '../lib/summary'
  import { leadSymptom } from '../lib/vocabulary'
  import { intensityColor, intensityInk } from '../lib/color'
  import { shareOrDownload, exportFilename } from '../lib/backup'
  import { showToast, showFailure } from '../lib/toast.svelte'

  /** `symptom`: the one its figures read (§7, #38), the one picked on Trends; else the first read in range, in the editor's order. */
  let {
    days,
    from,
    entries,
    tags,
    symptoms,
    symptom: given,
    onclose,
  }: { days: number; from: Date; entries: Entry[]; tags: Tag[]; symptoms: Symptom[]; symptom?: string; onclose: () => void } = $props()

  const to = $derived(rangeEnd(from, days))
  const fmtDate = (d: Date) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
  const fmtDay = (iso: string) => new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))
  const symptom = $derived(symptoms.find((s) => s.id === given) ?? symptomsRead(entries, symptoms)[0])
  const sid = $derived(symptom?.id ?? PAIN)
  const series = $derived(dailySeries(entries, from, days, sid))
  const summary = $derived(summarize(entries, sid))
  const counts = $derived(tagCounts(entries, tags))
  const others = $derived(symptomMedians(entries, symptoms, sid))
  /** The symptom's figures only when something in range reads it (#36). */
  const read = $derived(summary.median !== null)
  const heat = $derived(regionHeat(entries, sid))
  const whole = $derived(fullBody(entries, sid))
  const strokes = $derived(allStrokes(entries, sid))
  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })
  const fmt1 = (v: number | null) => (v === null ? '–' : num(v))
  /**
   * Under the episode count, the median length of the ended ones (§6.3). Those still going on are counted but have no
   * length yet; the log lists them, so the tile no longer says how many (#120).
   */
  const episodeLine = (s: Summary) => (s.medianEpisodeMs !== null ? t('trends.episodeMedian', { d: formatDuration(s.medianEpisodeMs, units) }) : '')
  /** The tag tables in the order the tags are listed everywhere (§6.3): medications, remedies, context. */
  const TAG_GROUPS: TagGroup[] = ['medication', 'intervention', 'context']
  /** Compact chronological list: episodes and entries with notes; an update is read through its episode. */
  const episodes = $derived(episodesOf(entries))
  const notable = $derived(entries.filter((e) => !isUpdate(e) && (isHead(e) || e.note)).sort((a, b) => a.at.localeCompare(b.at)))
  function rowOf(e: Entry) {
    const ep = isHead(e) ? episodes.get(e.id) : undefined
    const cur = ep ? shownReading(ep) : e
    const hl = entryHeadline(cur, leadSymptom(symptoms))
    return { cur, hl, read: isRead(cur.layers), shown: ep ? chainLayers(ep) : cur.layers, levels: ep && ep.updates.length ? trail([ep.head, ...ep.updates], hl.id) : [], dur: durationMs(e) }
  }

  $effect(() => {
    document.body.classList.add('printing')
    return () => document.body.classList.remove('printing')
  })

  let article = $state<HTMLElement | undefined>()

  /** The report as one HTML file: the page markup plus every stylesheet rule, so it opens and prints anywhere. */
  function standaloneHtml(): string {
    let css = ''
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        css += Array.from(sheet.cssRules).map((r) => r.cssText).join('\n')
      } catch {
        /* cross-origin sheet: none expected */
      }
    }
    const lang = document.documentElement.lang || 'it'
    return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t('report.title')}</title><style>${css}</style></head><body class="printing"><div class="report" style="position:static;overflow:visible">${article?.outerHTML ?? ''}</div></body></html>`
  }

  async function share() {
    try {
      await shareOrDownload(exportFilename('html'), standaloneHtml(), 'text/html')
      showToast(t('report.shared'))
    } catch (err) {
      if ((err as Error).name !== 'AbortError') showFailure(t('export.failed'))
    }
  }
</script>

<div class="report">
  <div class="toolbar no-print">
    <button class="btn" onclick={onclose}>{t('common.close')}</button>
    <button class="btn" onclick={share}>{t('report.share')}</button>
    <button class="btn primary grow" onclick={() => window.print()}>{t('report.print')}</button>
  </div>

  <article class="page" bind:this={article}>
    <header>
      <h1>{t('report.title')}</h1>
      <p class="muted">{t('report.range', { a: fmtDate(from), b: fmtDate(to) })} · {t('report.generated', { d: fmtDate(new Date()) })}</p>
    </header>

    <!-- The whole diary first, then the symptom picked under its own heading, as on Trends (#120). -->
    <section class="figures">
      <div><span class="k">{t('trends.chronic')}</span><b>{summary.chronicDays} <span class="of">{t('trends.ofDays', { d: days })}</span></b><span class="k">{tn('trends.entriesTotal', summary.chronicEntries)}</span></div>
      <div><span class="k">{t('trends.episodes')}</span><b>{summary.episodes} <span class="of">{t('trends.inDays', { d: days })}</span></b><span class="k">{episodeLine(summary)}</span></div>
    </section>

    {#if read && symptom}
      <section>
        <h2>{t('trends.howMuch', { name: tl(symptom.label) })}</h2>
        <WorstDays worst={summary.worst} median={summary.median} {days} />
      </section>
    {/if}

    <section class="two">
      <div>
        <h2>{read && symptom ? t('trends.where', { name: tl(symptom.label) }) : t('trends.heatmap')}</h2>
        <div class="map"><BodyMap {heat} {strokes} labels={{ front: t('log.front'), back: t('log.back') }} /></div>
        <RampKey />
        {#if whole}<p>{tn('trends.fullBody', whole.count, { m: num(whole.median) })}</p>{/if}
        <p class="muted">{t('trends.heatmapHint')}</p>
      </div>
      <div>
        {#if read && symptom}
          <h2>{t('trends.overTime')}</h2>
          <DailyChart {series} label={t('trends.chartLabel', { name: tl(symptom.label) })} name={tl(symptom.label)} height={150} interactive={false} />
        {/if}
      </div>
    </section>

    <!--
      The other symptoms and the tags: one below the other on screen; one row on paper, Altri sintomi beside the tags'
      groups, as tall as the longest column rather than all stacked, so the summary fits its first page in most cases (#120).
    -->
    <div class="rest">
    {#if others.length}
      <section>
        <h2>{t('trends.symptoms')}</h2>
        <table>
          <tbody>
            {#each others as s (s.symptom.id)}<tr><td>{tl(s.symptom.label)}</td><td class="num">{fmt1(s.median)}</td><td class="num muted">{t('report.dayCount', { n: s.count })}</td></tr>{/each}
          </tbody>
        </table>
      </section>
    {/if}
    <!-- A group of tags each under its own heading, in the order they are listed everywhere (#120). -->
    {#each TAG_GROUPS as g (g)}
      {@const rows = counts.filter((c) => c.tag.group === g)}
      {#if rows.length}
        <section>
          <h2>{t(`tag.group.${g}`)}</h2>
          <table>
            <tbody>
              {#each rows as c (c.tag.id)}<tr><td>{tl(c.tag.label)}</td><td class="num muted">{t('report.dayCount', { n: c.days })}</td></tr>{/each}
            </tbody>
          </table>
        </section>
      {/if}
    {/each}
    </div>

    <!-- On paper the diary starts a page of its own, the summary whole on the first (#120). -->
    {#if notable.length}
      <section class="diary">
        <h2>{t('report.notable')}</h2>
        <table class="list">
          <tbody>
            {#each notable as e (e.id)}
              {@const r = rowOf(e)}
              <tr>
                <td class="when">{fmtDay(e.at)} {formatTime(e.at, locale())}</td>
                <td class="num"><span class="pill" style="background: {intensityColor(r.hl.value)}; color: {intensityInk(r.hl.value)}">{r.read ? r.hl.value : '–'}</span></td>
                <td>
                  <EntrySummary lead={r.read ? symptomName(r.hl.id, symptoms, tl) : ''} layers={r.shown} tagDefs={tags} {symptoms} />
                  {#if r.dur !== null}<span class="muted"> · {isActive(e) ? t('diary.ongoing') : formatDuration(r.dur, units)}</span>{/if}
                  {#if r.levels.length}<span class="muted"> · {r.levels.join(' → ')}</span>{/if}
                  {#if e.note}<div class="note">{e.note}</div>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
    <!-- The one page a clinician sees, however it reached them: it says what it is (#35). -->
    <footer class="disclaimer muted">{t('report.disclaimer')}</footer>
    <!--
      And at the foot of every printed page, a page margin box (#120): a doctor may read only the first page. Inside the
      article, so the shared file carries it; where margin boxes are not printed, the line above still ends the report.
    -->
    {@html `<style>@page { @bottom-left { content: ${JSON.stringify(t('report.disclaimer'))}; font: 8pt system-ui, sans-serif; color: #5c5c64; } }</style>`}
  </article>
</div>

<style>
  .report {
    position: fixed; inset: 0; z-index: 60; overflow-y: auto;
    --bg: #ffffff; --surface: #ffffff; --surface-2: #ececea; --ink: #141416; --ink-2: #5c5c64; --ink-3: #9a9aa2; --border: #dcdcd8; --c-zero: #d5d5d1;
    background: var(--bg); color: var(--ink); color-scheme: light;
  }
  .toolbar { position: sticky; top: 0; display: flex; flex-wrap: wrap; gap: 10px; padding: max(10px, env(safe-area-inset-top)) 12px 10px; background: var(--bg); border-bottom: 1px solid var(--border); z-index: 1; }
  .page { max-width: 760px; margin: 0 auto; padding: 16px 16px 40px; display: flex; flex-direction: column; gap: 18px; font-size: 15px; }
  h1 { font-size: 22px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-2); margin: 10px 0 6px; }
  .k { font-size: 13px; color: var(--ink-2); display: block; }
  .figures { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .figures > div { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
  .figures b { font-size: 22px; display: block; line-height: 1.2; }
  .figures .of { font-size: 14px; font-weight: 400; color: var(--ink-2); }
  .two { display: grid; grid-template-columns: 1fr 1.3fr; gap: 16px; }
  .map { height: 260px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 6px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .when { white-space: nowrap; color: var(--ink-2); }
  .pill { min-width: 26px; height: 22px; font-size: 12px; }
  .note { color: var(--ink-2); font-style: italic; }
  .rest { display: grid; gap: 18px; }
  @media (max-width: 520px) {
    .two { grid-template-columns: 1fr; }
  }
  @media print {
    .report { position: static; overflow: visible; }
    .no-print { display: none; }
    /* Sizes for A4 paper; the screen gets larger ones, since the shared file is also read on a phone (#23). */
    .page { max-width: none; padding: 0; font-size: 13px; }
    .k { font-size: 11px; }
    .two { grid-template-columns: 1fr 1.3fr; }
    section { break-inside: avoid; }
    .rest { grid-auto-flow: column; grid-template-columns: 1.3fr; grid-auto-columns: 1fr; gap: 14px; align-items: start; }
    .diary { break-before: page; }
    /* A shorter map on paper, so the tags fit the first page in most cases (#120). */
    .map { height: 200px; }
    td { padding: 2px 6px; }
  }
  .disclaimer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 12px; }
</style>
