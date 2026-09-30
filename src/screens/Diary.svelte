<script lang="ts">
  import EditSheet from '../components/EditSheet.svelte'
  import EpisodeSheet from '../components/EpisodeSheet.svelte'
  import EntrySummary from '../components/EntrySummary.svelte'
  import { t, tl, locale } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { durationMs, episodesOf, isHead, isUpdate, isActive, latest, chainLayers } from '../lib/entries'
  import { intensityColor, intensityInk } from '../lib/color'
  import { dayKey, formatDay, formatTime, formatDuration } from '../lib/time'
  import type { Entry } from '../lib/types'
  import type { Episode } from '../lib/entries'
  import { entryHeadline, symptomName, trail } from '../lib/summary'
  import { search, snippet, words, type SearchContext } from '../lib/search'

  /** What is typed in the header's field (§6.2); nothing typed, the Diary as it is. */
  let { query = '' }: { query?: string } = $props()

  let days = $state(30)
  const cutoff = $derived(new Date(Date.now() - days * 86_400_000).toISOString())
  const entries = live(() => days, () => db.entries.where('at').aboveOrEqual(cutoff).reverse().toArray(), [])
  const total = live(() => null, () => db.entries.count(), 0)
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  const presets = live(() => null, () => db.presets.toArray(), [])

  /** A search runs over the whole table, and lists readings: an update is a hit of its own (§6.2). */
  const searching = $derived(words(query).length > 0)
  const all = live(() => searching, () => (searching ? db.entries.toArray() : Promise.resolve([])), [] as Entry[])
  const ctx = $derived.by((): SearchContext => {
    void prefs.lang
    return { tags: tags.value, symptoms: symptoms.value, presets: presets.value, tl, t }
  })
  const hits = $derived(searching ? search(all.value, query, ctx) : [])

  /** The episodes among the rows loaded: outside a search an update is read through its head, never a row of its own (§6.2). */
  const episodes = $derived(episodesOf(searching ? all.value : entries.value))
  const groups = $derived.by(() => {
    const out: { key: string; label: string; items: Entry[] }[] = []
    for (const e of searching ? hits : entries.value.filter((e) => !isUpdate(e))) {
      const key = dayKey(e.at)
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        g = { key, label: formatDay(e.at, locale(), { today: t('diary.today'), yesterday: t('diary.yesterday') }), items: [] }
        out.push(g)
      }
      g.items.push(e)
    }
    return out
  })
  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })
  const count = $derived.by(() => {
    const n = hits.length
    const d = new Set(hits.map((e) => dayKey(e.at))).size
    return `${n === 1 ? t('diary.entries.one') : t('diary.entries', { n })} · ${d === 1 ? t('diary.days.one') : t('diary.days', { n: d })}`
  })
  /**
   * What a row shows: for an episode, its latest reading and its trail (§5.5); a row logged from a preset is named after
   * it (§5.6). A hit shows its own reading, the one that matched; an update, when its episode started.
   */
  function rowOf(e: Entry) {
    const ep: Episode | undefined = isHead(e) ? episodes.get(e.id) : undefined
    const head = isUpdate(e) ? episodes.get(e.episodeId!)?.head : undefined
    const cur = ep && !searching ? latest(ep) : e
    const hl = entryHeadline(cur)
    const presetId = (head ?? e).presetId
    const name = presetId ? presets.value.find((p) => p.id === presetId)?.name : undefined
    const lead = [name, symptomName(hl.id, symptoms.value, tl)].filter(Boolean).join(' · ')
    const started = !head ? '' : [dayKey(head.at) === dayKey(e.at) ? '' : formatDay(head.at, locale(), { today: t('diary.today'), yesterday: t('diary.yesterday') }).toLowerCase(), formatTime(head.at, locale())].filter(Boolean).join(' ')
    return {
      cur, hl, lead, head, started,
      shown: ep && !searching ? chainLayers(ep) : cur.layers,
      where: !name || cur.layers.length > 1,
      levels: ep && ep.updates.length ? trail([ep.head, ...ep.updates], hl.id) : [],
      dur: durationMs(e),
      note: searching ? snippet(e.note, query) : e.note,
    }
  }

  /** A new search, or its end, starts at the top of the list. */
  let scroller = $state<HTMLDivElement>()
  $effect(() => {
    void query
    if (scroller) scroller.scrollTop = 0
  })

  let editing = $state.raw<Entry | null>(null)
  let episode = $state.raw<Entry | null>(null)
</script>

<div class="screen" bind:this={scroller}>
  {#if total.value === 0}
    <div class="empty">
      <p>{t('diary.empty')}</p>
      <p class="muted small">{t('diary.emptyHint')}</p>
    </div>
  {:else}
    {#if searching}
      <p class="count small muted">{hits.length ? count : t('diary.none')}</p>
    {/if}
    {#each groups as g (g.key)}
      <section>
        <h2 class="day">{g.label}</h2>
        <div class="list">
          {#each g.items as e (e.id)}
            {@const r = rowOf(e)}
            <button class="entry card row" class:hit={searching} onclick={() => (isHead(e) ? (episode = e) : r.head ? (episode = r.head) : (editing = e))}>
              <span class="time muted small">{formatTime(e.at, locale())}</span>
              <span class="pill" style="background: {intensityColor(r.hl.value)}; color: {intensityInk(r.hl.value)}">{r.hl.value}</span>
              <span class="grow body">
                <span class="line"><EntrySummary lead={r.lead} layers={r.shown} where={r.where} tagDefs={tags.value} /></span>
                {#if r.dur !== null}
                  <span class="small muted">{isActive(e) ? t('diary.ongoing') : formatDuration(r.dur, units)}{#if r.levels.length}{` · ${r.levels.join(' → ')}`}{/if}</span>
                {/if}
                {#if r.head}<span class="small muted">{t('diary.update')} · {t('diary.started', { when: r.started })}</span>{/if}
                {#if r.note}<span class="small muted note">{r.note}</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
    {#if !searching && entries.value.length < total.value}
      <button class="btn" onclick={() => (days += 60)}>{t('diary.more')}</button>
    {/if}
  {/if}
</div>

<EpisodeSheet bind:entry={episode} tagDefs={tags.value} symptoms={symptoms.value} onedit={(e) => (editing = e)} />
<EditSheet bind:entry={editing} symptoms={symptoms.value} tags={tags.value} />

<style>
  .empty { text-align: center; padding: 48px 0; }
  .count { margin: 2px 0 -4px; }
  .day { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-2); margin: 6px 0 8px; }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .entry { width: 100%; text-align: left; padding: 10px 12px; }
  .time { min-width: 44px; flex: none; font-variant-numeric: tabular-nums; }
  .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* A search hit wraps: what matched may sit at the end of a long line. */
  .hit .line, .hit .note { white-space: normal; overflow-wrap: anywhere; }
</style>
