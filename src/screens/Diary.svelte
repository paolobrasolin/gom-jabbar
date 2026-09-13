<script lang="ts">
  import EditSheet from '../components/EditSheet.svelte'
  import EntrySummary from '../components/EntrySummary.svelte'
  import { t, locale } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { durationMs } from '../lib/entries'
  import { intensityColor, intensityInk } from '../lib/color'
  import { dayKey, formatDay, formatTime, formatDuration } from '../lib/time'
  import { PAIN, type Entry } from '../lib/types'

  let days = $state(30)
  const cutoff = $derived(new Date(Date.now() - days * 86_400_000).toISOString())
  const entries = live(() => days, () => db.entries.where('at').aboveOrEqual(cutoff).reverse().toArray(), [])
  const total = live(() => null, () => db.entries.count(), 0)
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])

  const groups = $derived.by(() => {
    const out: { key: string; label: string; items: Entry[] }[] = []
    for (const e of entries.value) {
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

  let editing = $state.raw<Entry | null>(null)
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
            {@const pain = e.readings[PAIN] ?? 0}
            {@const dur = durationMs(e)}
            <button class="entry card row" onclick={() => (editing = e)}>
              <span class="time muted small">{formatTime(e.at, locale())}</span>
              <span class="pill" style="background: {intensityColor(pain)}; color: {intensityInk(pain)}">{pain}</span>
              <span class="grow body">
                <span class="line"><EntrySummary areas={e.areas} tags={e.tags} tagDefs={tags.value} /></span>
                {#if dur !== null}
                  <span class="small muted">{e.ongoing ? t('diary.ongoing') : formatDuration(dur, units)}{#if e.history?.length} · {[(e.history.length ? e.history[0].pain : pain), ...e.history.slice(1).map((h) => h.pain)].join(' → ')}{/if}</span>
                {/if}
                {#if e.note}<span class="small muted note">{e.note}</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
    {#if entries.value.length < total.value}
      <button class="btn" onclick={() => (days += 60)}>…</button>
    {/if}
  {/if}
</div>

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
