<script lang="ts">
  import EntryForm from '../components/EntryForm.svelte'
  import EntrySummary from '../components/EntrySummary.svelte'
  import EditSheet from '../components/EditSheet.svelte'
  import EpisodeSheet from '../components/EpisodeSheet.svelte'
  import PresetSheet from '../components/PresetSheet.svelte'
  import PresetForm, { type PresetSeed } from '../components/PresetForm.svelte'
  import Sheet from '../components/Sheet.svelte'
  import { t, tl } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { prefs, savePrefs } from '../lib/prefs.svelte'
  import { emptyDraft, draftToInput, type EntryDraft } from '../lib/draft'
  import { addEntry, deleteEntry, endEpisode, reopenEpisode, durationMs, activeEpisodes, latest, type Episode } from '../lib/entries'
  import { showToast, haptic } from '../lib/toast.svelte'
  import { intensityColor, intensityInk } from '../lib/color'
  import { formatDuration } from '../lib/time'
  import { PAIN, type Entry, type Preset } from '../lib/types'
  import { lastByPreset, presetEntries } from '../lib/presets'
  import { entryHeadline, symptomName } from '../lib/summary'
  import { backupDue, buildExport, shareOrDownload, exportFilename } from '../lib/backup'
  import { install, installDue, isStandalone, isIOS, requestInstall } from '../lib/install.svelte'

  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const active = live(() => null, () => activeEpisodes(), [] as Episode[])
  const presets = live(() => null, () => db.presets.orderBy('order').toArray(), [])
  const lastBy = live(() => null, async () => lastByPreset(await presetEntries()), {} as Record<string, Entry>)
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
  let draft = $state(emptyDraft({ kind: prefs.ongoing ? 'episode' : 'chronic' }))
  /** Anything worth clearing: a region, a tag or a reading other than pain on any layer, a time, a note, a preset just named. The pain level alone is not. */
  const dirty = $derived(
    draft.layers.some((l) => l.regions.length > 0 || l.tags.length > 0 || Object.entries(l.readings).some(([id, v]) => id !== PAIN && v > 0)) ||
      draft.at !== null ||
      draft.endedAt !== null ||
      draft.note.trim() !== '' ||
      !!draft.presetId,
  )
  let saving = $state(false)
  let editing = $state.raw<Entry | null>(null)
  let episode = $state.raw<Entry | null>(null)

  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })

  function reset() {
    draft = emptyDraft({ kind: draft.kind, pain: draft.layers[draft.cur]?.readings[PAIN] ?? 5 })
    document.querySelectorAll<HTMLElement>('.form .chips').forEach((el) => (el.scrollLeft = 0))
  }

  /** Azzera: back to an empty form, undoable from the toast (no confirmation dialogs, §6.1). */
  function clear() {
    const before = $state.snapshot(draft) as EntryDraft
    draft = emptyDraft({ kind: draft.kind })
    document.querySelectorAll<HTMLElement>('.form .chips').forEach((el) => (el.scrollLeft = 0))
    haptic(20)
    showToast(t('log.cleared'), { label: t('log.undo'), run: () => (draft = before) })
  }

  async function save() {
    if (saving) return
    saving = true
    try {
      prefs.ongoing = draft.kind === 'episode'
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
  let presetSeed = $state.raw<PresetSeed | null>(null)

  /** "+" in the strip (§5.6): name what is on the form, as it stands, empty included. */
  function newPreset() {
    presetSeed = { draft: $state.snapshot(draft) as EntryDraft }
  }
  /** The form now carries the name: the ordinary Salva logs the first reading under it, and so does the chip's sheet, which then empties the form. Undo on the toast unlinks it. */
  function linkPreset(p: Preset) {
    draft.presetId = p.id
  }
  function unlinkPreset(p: Preset) {
    if (draft.presetId === p.id) draft.presetId = undefined
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
      {#each active.value as ep (ep.head.id)}
        {@const cur = latest(ep)}
        {@const hl = entryHeadline(cur)}
        <div class="card episode row">
          <button class="row grow open" onclick={() => (episode = ep.head)} aria-label={t('episode.active')}>
            <span class="pill" style="background: {intensityColor(hl.value)}; color: {intensityInk(hl.value)}">{hl.value}</span>
            <span class="grow small text">
              <span class="line"><EntrySummary lead={symptomName(hl.id, symptoms.value, tl)} layers={cur.layers} tagDefs={tags.value} /></span>
              <span class="muted">{t('episode.since', { d: formatDuration(durationMs(ep.head, tick) ?? 0, units) })}</span>
            </span>
          </button>
          <button class="btn" onclick={() => end(ep.head.id)}>{t('episode.end')}</button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Always there (§5.6): "+" first so it never scrolls away, and, before the first preset, its name. -->
  <div class="chips presets" aria-label={t('preset.strip')}>
    <button class="chip small outline" aria-label={t('preset.new')} onclick={newPreset}>+{#if !presets.value.length}&nbsp;{t('preset.new')}{/if}</button>
    {#each presets.value as p (p.id)}
      {@const last = lastBy.value[p.id]}
      {@const hl = last ? entryHeadline(last) : null}
      <button class="chip small tchip" aria-pressed={draft.presetId === p.id} onclick={() => (presetOpen = p)}>
        {#if hl}<span class="dot" style="background: {intensityColor(hl.value)}; color: {intensityInk(hl.value)}">{hl.value}</span>{/if}
        {p.name} · {last ? formatDuration(Math.max(0, tick - Date.parse(last.at)), units) : t('preset.never')}
      </button>
    {/each}
  </div>

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
<PresetForm bind:seed={presetSeed} symptoms={symptoms.value} oncreate={linkPreset} onundo={unlinkPreset} />
<PresetSheet bind:preset={presetOpen} symptoms={symptoms.value} onsaved={(p) => draft.presetId === p.id && reset()} />
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
