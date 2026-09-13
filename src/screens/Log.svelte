<script lang="ts">
  import EntryForm from '../components/EntryForm.svelte'
  import EntrySummary from '../components/EntrySummary.svelte'
  import { t, locale } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { prefs, savePrefs } from '../lib/prefs.svelte'
  import { emptyDraft, draftToInput } from '../lib/draft'
  import { addEntry, deleteEntry, endEpisode, reopenEpisode, lastEntry, repeatEntry, durationMs } from '../lib/entries'
  import { showToast, haptic } from '../lib/toast.svelte'
  import { intensityColor, intensityInk } from '../lib/color'
  import { formatDuration } from '../lib/time'
  import { PAIN } from '../lib/types'

  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const active = live(() => null, () => db.entries.filter((e) => e.ongoing).sortBy('at'), [])
  const count = live(() => null, () => db.entries.count(), -1)

  let draft = $state(emptyDraft({ ongoing: prefs.ongoing }))
  let detailsOpen = $state(false)
  let saving = $state(false)
  let tick = $state(Date.now())
  $effect(() => {
    const id = setInterval(() => (tick = Date.now()), 30_000)
    return () => clearInterval(id)
  })

  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })

  function reset() {
    draft = emptyDraft({ ongoing: draft.ongoing, pain: draft.readings[PAIN] ?? 5 })
    detailsOpen = false
  }

  async function save() {
    if (saving) return
    saving = true
    try {
      prefs.ongoing = draft.ongoing
      savePrefs()
      const entry = await addEntry(draftToInput(draft))
      haptic(20)
      showToast(t('log.saved'), { label: t('log.undo'), run: () => void deleteEntry(entry.id) })
      reset()
    } finally {
      saving = false
    }
  }

  async function repeatLast() {
    const last = await lastEntry()
    if (!last) return
    const entry = await repeatEntry(last)
    haptic(20)
    showToast(t('log.saved'), { label: t('log.undo'), run: () => void deleteEntry(entry.id) })
  }

  async function end(id: string) {
    await endEpisode(id)
    haptic(20)
    showToast(t('episode.ended'), { label: t('log.undo'), run: () => void reopenEpisode(id) })
  }
</script>

<div class="screen log">
  {#if active.value.length}
    <div class="episodes">
      {#each active.value as e (e.id)}
        {@const pain = e.readings[PAIN] ?? 0}
        <div class="card episode row">
          <span class="pill" style="background: {intensityColor(pain)}; color: {intensityInk(pain)}">{pain}</span>
          <div class="grow small">
            <div><EntrySummary areas={e.areas} tags={e.tags} tagDefs={tags.value} /></div>
            <div class="muted">{t('episode.since', { d: formatDuration(durationMs(e, tick) ?? 0, units) })}</div>
          </div>
          <button class="btn" onclick={() => end(e.id)}>{t('episode.end')}</button>
        </div>
      {/each}
    </div>
  {/if}

  <EntryForm bind:draft {detailsOpen} symptoms={symptoms.value} tags={tags.value} />

  <div class="actions">
    <button class="btn primary grow" onclick={save} disabled={saving}>{t('log.save')}</button>
    <button class="btn" class:active={detailsOpen} aria-expanded={detailsOpen} onclick={() => (detailsOpen = !detailsOpen)}>
      {t('log.details')} {detailsOpen ? '▴' : '▾'}
    </button>
    <button class="btn" onclick={repeatLast} disabled={count.value <= 0} aria-label={t('log.repeatLast')} title={t('log.repeatLast')}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
      </svg>
    </button>
  </div>
</div>

<style>
  .log { padding-bottom: 8px; }
  .episodes { display: flex; flex-direction: column; gap: 8px; }
  .episode { padding: 10px 12px; }
  .actions {
    position: sticky;
    bottom: 0;
    display: flex;
    gap: 10px;
    padding-top: 8px;
    background: linear-gradient(to top, var(--bg) 70%, transparent);
    margin-top: auto;
  }
  .actions .btn.primary { min-height: 56px; font-size: 18px; }
  .actions .btn:not(.primary) { min-height: 56px; padding: 0 14px; }
  .actions .btn.active { box-shadow: inset 0 0 0 1.5px var(--ink-2); }
</style>
