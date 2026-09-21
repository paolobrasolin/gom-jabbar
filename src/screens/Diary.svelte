<script lang="ts">
  import EditSheet from '../components/EditSheet.svelte'
  import EpisodeSheet from '../components/EpisodeSheet.svelte'
  import EntrySummary from '../components/EntrySummary.svelte'
  import { t, tl, locale } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { durationMs, episodesOf, isHead, isUpdate, isActive, latest } from '../lib/entries'
  import { intensityColor, intensityInk } from '../lib/color'
  import { dayKey, formatDay, formatTime, formatDuration } from '../lib/time'
  import type { Entry } from '../lib/types'
  import { entryHeadline, symptomName, trail } from '../lib/summary'

  let days = $state(30)
  const cutoff = $derived(new Date(Date.now() - days * 86_400_000).toISOString())
  const entries = live(() => days, () => db.entries.where('at').aboveOrEqual(cutoff).reverse().toArray(), [])
  const total = live(() => null, () => db.entries.count(), 0)
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  const presets = live(() => null, () => db.presets.toArray(), [])

  /** The episodes among the rows loaded: an update is read through its head, never a row of its own (§6.2). */
  const episodes = $derived(episodesOf(entries.value))
  const groups = $derived.by(() => {
    const out: { key: string; label: string; items: Entry[] }[] = []
    for (const e of entries.value) {
      if (isUpdate(e)) continue
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
  /** What a row shows: for an episode, its latest reading and its trail (§5.5); a row logged from a preset is named after it (§5.6). */
  function rowOf(e: Entry) {
    const ep = isHead(e) ? episodes.get(e.id) : undefined
    const cur = ep ? latest(ep) : e
    const hl = entryHeadline(cur)
    const name = e.presetId ? presets.value.find((p) => p.id === e.presetId)?.name : undefined
    const lead = [name, symptomName(hl.id, symptoms.value, tl)].filter(Boolean).join(' · ')
    return { cur, hl, lead, where: !name || cur.layers.length > 1, levels: ep && ep.updates.length ? trail([ep.head, ...ep.updates], hl.id) : [], dur: durationMs(e) }
  }

  let editing = $state.raw<Entry | null>(null)
  let episode = $state.raw<Entry | null>(null)
</script>

<div class="screen">
  {#if total.value === 0}
    <div class="empty">
      <p>{t('diary.empty')}</p>
      <p class="muted small">{t('diary.emptyHint')}</p>
    </div>
  {:else}
    {#each groups as g (g.key)}
      <section>
        <h2 class="day">{g.label}</h2>
        <div class="list">
          {#each g.items as e (e.id)}
            {@const r = rowOf(e)}
            <button class="entry card row" onclick={() => (isHead(e) ? (episode = e) : (editing = e))}>
              <span class="time muted small">{formatTime(e.at, locale())}</span>
              <span class="pill" style="background: {intensityColor(r.hl.value)}; color: {intensityInk(r.hl.value)}">{r.hl.value}</span>
              <span class="grow body">
                <span class="line"><EntrySummary lead={r.lead} layers={r.cur.layers} where={r.where} tagDefs={tags.value} /></span>
                {#if r.dur !== null}
                  <span class="small muted">{isActive(e) ? t('diary.ongoing') : formatDuration(r.dur, units)}{#if r.levels.length}{` · ${r.levels.join(' → ')}`}{/if}</span>
                {/if}
                {#if e.note}<span class="small muted note">{e.note}</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
    {#if entries.value.length < total.value}
      <button class="btn" onclick={() => (days += 60)}>{t('diary.more')}</button>
    {/if}
  {/if}
</div>

<EpisodeSheet bind:entry={episode} tagDefs={tags.value} symptoms={symptoms.value} onedit={(e) => (editing = e)} />
<EditSheet bind:entry={editing} symptoms={symptoms.value} tags={tags.value} />

<style>
  .empty { text-align: center; padding: 48px 0; }
  .day { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-2); margin: 6px 0 8px; }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .entry { width: 100%; text-align: left; padding: 10px 12px; }
  .time { width: 44px; flex: none; font-variant-numeric: tabular-nums; }
  .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
