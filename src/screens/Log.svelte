<script lang="ts">
  import EntryForm from '../components/EntryForm.svelte'
  import EntrySummary from '../components/EntrySummary.svelte'
  import EditSheet from '../components/EditSheet.svelte'
  import EpisodeSheet from '../components/EpisodeSheet.svelte'
  import PresetSheet from '../components/PresetSheet.svelte'
  import Sheet from '../components/Sheet.svelte'
  import { t, tl } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { prefs, savePrefs } from '../lib/prefs.svelte'
  import { emptyDraft, draftToInput, type EntryDraft } from '../lib/draft'
  import { addEntry, deleteEntry, endEpisode, reopenEpisode, durationMs } from '../lib/entries'
  import { showToast, haptic } from '../lib/toast.svelte'
  import { intensityColor, intensityInk } from '../lib/color'
  import { formatDuration } from '../lib/time'
  import { PAIN, type Entry, type Preset } from '../lib/types'
  import { lastByPreset } from '../lib/presets'
  import { headline, symptomName } from '../lib/summary'
  import { backupDue, buildExport, shareOrDownload, exportFilename } from '../lib/backup'
  import { install, installDue, isStandalone, isIOS, requestInstall } from '../lib/install.svelte'

  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const active = live(() => null, () => db.entries.filter((e) => e.ongoing).sortBy('at'), [])
  const presets = live(() => null, () => db.presets.orderBy('order').toArray(), [])
  const lastBy = live(() => null, async () => lastByPreset(await db.entries.filter((e) => !!e.preset).toArray()), {} as Record<string, Entry>)
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

  // Read once: the display mode cannot change while the page lives.
  const standalone = isStandalone()
  const installNudge = $derived(installDue(standalone, prefs.installedAt, install.dismissed))
  let howTo = $state(false)
  async function installNow() {
    const r = await requestInstall()
    if (r === 'manual') howTo = true
    else if (r === 'accepted') haptic(20)
  }

  let tick = $state(Date.now())
  $effect(() => {
    const id = setInterval(() => (tick = Date.now()), 30_000)
    return () => clearInterval(id)
  })
  const nudge = $derived(backupDue(prefs.lastBackupAt, oldest.value, prefs.backupSnoozedUntil, tick))
  let draft = $state(emptyDraft({ ongoing: prefs.ongoing }))
  /** Anything worth clearing: areas, a time, a tag, a note, a reading other than pain. The pain level alone is not. */
  const dirty = $derived(
    draft.areas.length > 0 || draft.at !== null || draft.tags.length > 0 || draft.note.trim() !== '' || Object.entries(draft.readings).some(([id, v]) => id !== PAIN && v > 0),
  )
  let saving = $state(false)
  let editing = $state.raw<Entry | null>(null)
  let episode = $state.raw<Entry | null>(null)

  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })

  function reset() {
    draft = emptyDraft({ ongoing: draft.ongoing, pain: draft.readings[PAIN] ?? 5 })
    document.querySelectorAll<HTMLElement>('.form .chips').forEach((el) => (el.scrollLeft = 0))
  }

  /** Azzera: back to an empty form, undoable from the toast (no confirmation dialogs, §6.1). */
  function clear() {
    const before = $state.snapshot(draft) as EntryDraft
    draft = emptyDraft({ ongoing: draft.ongoing })
    document.querySelectorAll<HTMLElement>('.form .chips').forEach((el) => (el.scrollLeft = 0))
    haptic(20)
    showToast(t('log.cleared'), { label: t('log.undo'), run: () => (draft = before) })
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

  let presetOpen = $state.raw<Preset | null>(null)

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
        {@const hl = headline(e.readings)}
        <div class="card episode row">
          <button class="row grow open" onclick={() => (episode = e)} aria-label={t('episode.active')}>
            <span class="pill" style="background: {intensityColor(hl.value)}; color: {intensityInk(hl.value)}">{hl.value}</span>
            <span class="grow small text">
              <span class="line"><EntrySummary lead={symptomName(hl.id, symptoms.value, tl)} areas={e.areas} tags={e.tags} tagDefs={tags.value} /></span>
              <span class="muted">{t('episode.since', { d: formatDuration(durationMs(e, tick) ?? 0, units) })}</span>
            </span>
          </button>
          <button class="btn" onclick={() => end(e.id)}>{t('episode.end')}</button>
        </div>
      {/each}
    </div>
  {/if}

  {#if presets.value.length}
    <div class="chips presets" aria-label={t('preset.strip')}>
      {#each presets.value as p (p.id)}
        {@const last = lastBy.value[p.id]}
        {@const hl = last ? headline(last.readings) : null}
        <button class="chip small tchip" onclick={() => (presetOpen = p)}>
          {#if hl}<span class="dot" style="background: {intensityColor(hl.value)}; color: {intensityInk(hl.value)}">{hl.value}</span>{/if}
          {p.name} · {last ? formatDuration(Math.max(0, tick - Date.parse(last.at)), units) : t('preset.never')}
        </button>
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

  {#if installNudge}
    <div class="card row nudge small">
      <span class="grow">{t('install.nudge')}</span>
      <button class="chip small" onclick={installNow}>{t('install.now')}</button>
      <button class="chip small outline" onclick={() => (install.dismissed = true)} aria-label={t('install.later')}>✕</button>
    </div>
  {/if}

  <EntryForm bind:draft symptoms={symptoms.value} tags={tags.value} />

  <div class="actions">
    <button class="btn" onclick={clear} disabled={!dirty}>{t('log.clear')}</button>
    <button class="btn primary grow" onclick={save} disabled={saving}>{t('log.save')}</button>
  </div>
</div>
<PresetSheet bind:preset={presetOpen} last={presetOpen ? lastBy.value[presetOpen.id] : undefined} symptoms={symptoms.value} tagDefs={tags.value} />
<EpisodeSheet bind:entry={episode} tagDefs={tags.value} symptoms={symptoms.value} onedit={(e) => (editing = e)} />
<EditSheet bind:entry={editing} symptoms={symptoms.value} tags={tags.value} />
<Sheet bind:open={howTo} title={t('install.title')}>
  <p>{t(isIOS() ? 'install.ios' : 'install.android')}</p>
  <p class="small muted">{t('install.why')}</p>
</Sheet>

<style>
  .log { padding-bottom: 0; } /* the sticky bar carries the bottom padding, so nothing scrolls out under it */
  .episodes { display: flex; flex-direction: column; gap: 8px; }
  .nudge { padding: 8px 8px 8px 12px; }
  .episode { padding: 8px 8px 8px 12px; }
  .open { text-align: left; min-height: 44px; min-width: 0; }
  .text { display: flex; flex-direction: column; min-width: 0; }
  .line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .presets::-webkit-scrollbar { display: none; }
  .presets { flex: none; min-height: 38px; align-items: center; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -12px; padding: 2px 12px; }
  .tchip { padding-left: 6px; gap: 6px; font-variant-numeric: tabular-nums; }
  .dot { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; font-weight: 700; font-size: 12px; }
  .actions {
    position: sticky;
    bottom: 0;
    z-index: 1; /* above the slider thumbs scrolling under it */
    display: flex;
    gap: 10px;
    padding: 8px 0;
    background: linear-gradient(to top, var(--bg) 70%, transparent);
    margin-top: auto;
  }
  .actions .btn.primary { min-height: 56px; font-size: 18px; }
  .actions .btn:not(.primary) { min-height: 56px; padding: 0 18px; }
</style>
