<script lang="ts">
  import EntryForm from '../components/EntryForm.svelte'
  import EntrySummary from '../components/EntrySummary.svelte'
  import EditSheet from '../components/EditSheet.svelte'
  import EpisodeSheet from '../components/EpisodeSheet.svelte'
  import { t, locale } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { prefs, savePrefs } from '../lib/prefs.svelte'
  import { emptyDraft, draftToInput } from '../lib/draft'
  import { addEntry, deleteEntry, endEpisode, reopenEpisode, lastEntry, repeatEntry, durationMs } from '../lib/entries'
  import { showToast, haptic } from '../lib/toast.svelte'
  import { intensityColor, intensityInk } from '../lib/color'
  import { formatDuration, formatTime, dayKey } from '../lib/time'
  import { PAIN, type Entry } from '../lib/types'
  import { backupDue, buildExport, shareOrDownload, exportFilename } from '../lib/backup'

  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const active = live(() => null, () => db.entries.filter((e) => e.ongoing).sortBy('at'), [])
  const count = live(() => null, () => db.entries.count(), -1)
  const oldest = live(() => null, async () => (await db.entries.orderBy('createdAt').first())?.createdAt ?? null, null)

  async function backupNow() {
    try {
      await shareOrDownload(exportFilename('json'), JSON.stringify(await buildExport(), null, 1), 'application/json')
      prefs.lastBackupAt = new Date().toISOString()
      prefs.backupSnoozedUntil = null
      savePrefs()
      haptic(20)
      showToast(t('backup.done'))
    } catch (err) {
      if ((err as Error).name !== 'AbortError') showToast(t('backup.failed'))
    }
  }
  function snooze() {
    prefs.backupSnoozedUntil = new Date(Date.now() + 7 * 86_400_000).toISOString()
    savePrefs()
  }

  let tick = $state(Date.now())
  $effect(() => {
    const id = setInterval(() => (tick = Date.now()), 30_000)
    return () => clearInterval(id)
  })
  const todayKey = $derived(dayKey(new Date(tick).toISOString()))
  const nudge = $derived(backupDue(prefs.lastBackupAt, oldest.value, prefs.backupSnoozedUntil, tick))
  const today = live(
    () => todayKey,
    () => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      return db.entries.where('at').aboveOrEqual(start.toISOString()).toArray()
    },
    [],
  )

  let draft = $state(emptyDraft({ ongoing: prefs.ongoing }))
  let detailsOpen = $state(false)
  let saving = $state(false)
  let editing = $state.raw<Entry | null>(null)
  let episode = $state.raw<Entry | null>(null)

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
          <button class="row grow open" onclick={() => (episode = e)} aria-label={t('episode.active')}>
            <span class="pill" style="background: {intensityColor(pain)}; color: {intensityInk(pain)}">{pain}</span>
            <span class="grow small text">
              <span class="line"><EntrySummary areas={e.areas} tags={e.tags} tagDefs={tags.value} /></span>
              <span class="muted">{t('episode.since', { d: formatDuration(durationMs(e, tick) ?? 0, units) })}</span>
            </span>
          </button>
          <button class="btn" onclick={() => end(e.id)}>{t('episode.end')}</button>
        </div>
      {/each}
    </div>
  {/if}

  {#if nudge}
    <div class="card row nudge small">
      <span class="grow">{t('backup.nudge')}</span>
      <button class="chip small" onclick={backupNow}>{t('backup.now')}</button>
      <button class="chip small outline" onclick={snooze} aria-label={t('backup.later')}>✕</button>
    </div>
  {/if}

  <div class="chips today" aria-label={t('log.today')}>
    <span class="small muted label">{t('log.today')}</span>
    {#if today.value.length === 0}
      <span class="small muted">{t('log.todayEmpty')}</span>
    {:else}
      {#each today.value as e (e.id)}
        {@const pain = e.readings[PAIN] ?? 0}
        <button class="chip small tchip" onclick={() => (editing = e)}>
          <span class="dot" style="background: {intensityColor(pain)}; color: {intensityInk(pain)}">{pain}</span>
          {formatTime(e.at, locale())}
        </button>
      {/each}
    {/if}
  </div>

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

<EpisodeSheet bind:entry={episode} tagDefs={tags.value} onedit={(e) => (editing = e)} />
<EditSheet bind:entry={editing} symptoms={symptoms.value} tags={tags.value} />

<style>
  .log { padding-bottom: 8px; }
  .episodes { display: flex; flex-direction: column; gap: 8px; }
  .nudge { padding: 8px 8px 8px 12px; }
  .episode { padding: 8px 8px 8px 12px; }
  .open { text-align: left; min-height: 44px; min-width: 0; }
  .text { display: flex; flex-direction: column; min-width: 0; }
  .line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .today { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -12px; padding: 0 12px; min-height: 34px; align-items: center; }
  .today::-webkit-scrollbar { display: none; }
  .today .label { font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 12px; }
  .tchip { padding-left: 6px; gap: 6px; font-variant-numeric: tabular-nums; }
  .dot { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; font-weight: 700; font-size: 12px; }
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
