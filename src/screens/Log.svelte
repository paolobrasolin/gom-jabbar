<script lang="ts">
  import EntryForm from '../components/EntryForm.svelte'
  import EntrySummary from '../components/EntrySummary.svelte'
  import EditSheet from '../components/EditSheet.svelte'
  import EpisodeSheet from '../components/EpisodeSheet.svelte'
  import PresetSheet from '../components/PresetSheet.svelte'
  import PresetForm, { type PresetSeed } from '../components/PresetForm.svelte'
  import Sheet from '../components/Sheet.svelte'
  import NavMenu from '../components/NavMenu.svelte'
  import Dropdown from '../components/Dropdown.svelte'
  import { t, tl, tn } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { outdated } from '../lib/outdated.svelte'
  import { prefs, savePrefs, type Tab } from '../lib/prefs.svelte'
  import { emptyDraft, draftToInput, type EntryDraft } from '../lib/draft'
  import { strandedLayer } from '../lib/layers'
  import { loadDraft, storeDraft, pruneUnknown } from '../lib/logDraft'
  import { addEntry, deleteEntry, durationMs, activeEpisodes, latest, chainLayers, timeProblem, isStale, type Episode } from '../lib/entries'
  import { showToast, showFailure, showRefusal, haptic, toastState } from '../lib/toast.svelte'
  import { failed } from '../lib/failure'
  import { intensityColor, intensityInk } from '../lib/color'
  import { formatDuration } from '../lib/time'
  import type { Entry, Preset } from '../lib/types'
  import { firstEnabled } from '../lib/vocabulary'
  import { lastByPreset, presetEntries } from '../lib/presets'
  import { entryHeadline, symptomName, isRead } from '../lib/summary'
  import { backupReminder, REMIND } from '../lib/backup'
  import { fileBackup } from '../lib/fileBackup'
  import { cloudBackup, driveInUse, failureText, doneText } from '../lib/cloudBackup'
  import type { CloudProvider } from '../lib/cloud'
  import { install, installDue, isStandalone, isIOS, requestInstall } from '../lib/install.svelte'
  import MessageIcon from '../components/MessageIcon.svelte'

  let { cloud, navigate }: { cloud: CloudProvider; navigate: (to: Tab) => void } = $props()

  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const active = live(() => null, () => activeEpisodes(), [] as Episode[])
  const presets = live(() => null, () => db.presets.orderBy('order').toArray(), [])
  const lastBy = live(() => null, async () => lastByPreset(await presetEntries()), {} as Record<string, Entry>)
  const oldest = live(() => null, async () => (await db.entries.orderBy('createdAt').first())?.createdAt ?? null, null)

  /** The banner's button once Drive is in use: the same step as Backup su Drive in Settings. */
  async function driveNow() {
    const res = await cloudBackup(cloud)
    tick = Date.now()
    if (res === 'left') return
    if (!res.ok) return showFailure(failureText(res))
    haptic(20)
    showToast(doneText(res.value))
  }
  function snooze() {
    prefs.backupSnoozedUntil = new Date(Date.now() + REMIND[nudge?.drive ? 'drive' : 'file'].snooze * 86_400_000).toISOString()
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
  // The Drive state lives outside Svelte (localStorage); `tick` re-reads it every 30 s and after a banner backup.
  const nudge = $derived.by(() => {
    void tick
    const drive = driveInUse(cloud)
    return backupReminder({
      lastBackupAt: prefs.lastBackupAt,
      lastDriveAt: drive ? cloud.status().lastWriteAt : null,
      drive,
      oldestEntryAt: oldest.value,
      snoozedUntil: prefs.backupSnoozedUntil,
      now: tick,
    })
  })
  /** The body's headline (§6.1), the first enabled body symptom: a new draft starts it at 5, or where the last save left it. */
  const head = $derived(firstEnabled(symptoms.value, 'body')?.id)
  // Every draft starts Cronico: the kind is chosen per entry, never remembered (§6.1).
  // The draft outlives the log (§6.1): back from another screen, a reload or a kill, it is where it was left.
  let draft = $state(loadDraft() ?? emptyDraft())
  $effect(() => {
    storeDraft($state.snapshot(draft) as EntryDraft)
  })
  /** Anything worth clearing: a region, a tag or a reading on any layer, a time, a note, a preset just named. */
  const dirty = $derived(
    draft.layers.some((l) => l.regions.length > 0 || l.tags.length > 0 || Object.keys(l.readings).length > 0) ||
      draft.at !== null ||
      draft.endedAt !== null ||
      draft.note.trim() !== '' ||
      !!draft.presetId,
  )
  let saving = $state(false)
  /**
   * U2: the second tap of a double tap lands after the save has finished, on the fresh form. For a moment after a save
   * Salva ignores a form nobody has touched since; any touch makes it ready at once, so the fast path never waits.
   */
  let fresh = $state<string | null>(null)
  const cooling = $derived(fresh !== null && JSON.stringify(draft) === fresh)
  /**
   * The toast rises to the drawer's edge while the log is on screen; with the drawer pulled up there is no room above
   * it, so the toast goes to the top, clear of the rows the drawer shows (the time rows a refusal points at).
   */
  let peek = $state(0)
  let opened = $state(false)
  $effect(() => {
    toastState.lift = opened ? null : peek
    toastState.top = opened
    return () => {
      toastState.lift = null
      toastState.top = false
    }
  })
  let editing = $state.raw<Entry | null>(null)
  let episode = $state.raw<Entry | null>(null)

  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })

  function reset() {
    draft = emptyDraft()
    document.querySelectorAll<HTMLElement>('.form .chips').forEach((el) => (el.scrollLeft = 0))
  }

  /** Azzera: back to an empty form, undoable from the toast (no confirmation dialogs, §6.1). */
  function clear() {
    const before = $state.snapshot(draft) as EntryDraft
    draft = emptyDraft()
    document.querySelectorAll<HTMLElement>('.form .chips').forEach((el) => (el.scrollLeft = 0))
    haptic(20)
    showToast(t('log.cleared'), { label: t('log.undo'), run: () => (draft = before) })
  }

  let form = $state<EntryForm>()
  async function save() {
    if (saving || cooling) return
    // An end before the start is not a reading anyone had: say so and show the row, save nothing (§5.5, §10).
    const times = draftToInput(draft)
    // Nothing measured where there is something to measure: no value nobody chose is stored (§6.1 item 7). Say so and
    // put the finger on the slider. With no symptom on for the form, a place alone is a reading of its own.
    if (!times.layers?.some((l) => Object.keys(l.readings ?? {}).length) && form?.measures()) {
      showRefusal(t('log.noLevel'))
      form?.pointAtLevel()
      return
    }
    // A level or a tag on a layer with no place would vanish on save (#115): say where it is missing and show the figure.
    const stranded = strandedLayer(draft.layers)
    if (stranded !== null) {
      showRefusal(t('log.noPlace'))
      form?.pointAtLayer(stranded)
      return
    }
    if (timeProblem({ at: times.at!, endedAt: times.endedAt })) {
      showRefusal(t('time.endBeforeStart'))
      void form?.pointAt('end')
      return
    }
    saving = true
    try {
      let entry
      try {
        // A kept draft may name a tag, a symptom or a preset deleted meanwhile: dropped, never stored dangling.
        entry = await addEntry(await pruneUnknown(times))
      } catch (e) {
        return failed(e)
      }
      haptic(20)
      showToast(t('log.saved'), { label: t('log.undo'), run: () => void deleteEntry(entry.id).catch(failed) })
      reset()
      const mark = (fresh = JSON.stringify(draft))
      setTimeout(() => fresh === mark && (fresh = null), 1000)
    } finally {
      saving = false
    }
  }

  let presetOpen = $state.raw<Preset | null>(null)
  let presetSeed = $state.raw<PresetSeed | null>(null)

  /** Nuovo preset, last in the presets' dropdown (§5.6): name what is on the form, as it stands, empty included. */
  function newPreset() {
    presetSeed = { draft: $state.snapshot(draft) as EntryDraft }
  }
</script>

<div class="screen log">
  <!-- One row of dropdowns (#37): the screens, what is going on (only while something is), the presets (§5.6). Episodes and presets used to share a strip of chips and read as one kind of thing. -->
  <div class="top">
    <NavMenu onpick={navigate} />
    {#if active.value.length}
      {@const top = Math.max(...active.value.map((ep) => entryHeadline(latest(ep)).value))}
      <Dropdown label={t('episode.count', { n: active.value.length })} cls="episodes" style="background: {intensityColor(top)}; color: {intensityInk(top)}">
        {#snippet trigger()}
          <span class="name">{t('episode.count', { n: active.value.length })}</span>
          {@render chevron()}
        {/snippet}
        {#snippet items(close)}
          {#each active.value as ep (ep.head.id)}
            {@const cur = latest(ep)}
            {@const hl = entryHeadline(cur, head)}
            {@const read = isRead(cur.layers)}
            <button role="menuitem" onclick={() => {
                close()
                episode = ep.head
              }}>
              <span class="dot" style="background: {intensityColor(hl.value)}; color: {intensityInk(hl.value)}">{read ? hl.value : '–'}</span>
              <span><EntrySummary lead={read ? symptomName(hl.id, symptoms.value, tl) : ''} layers={chainLayers(ep)} tagDefs={tags.value} symptoms={symptoms.value} after={t('episode.since', { d: formatDuration(durationMs(ep.head, tick) ?? 0, units) })} />{#if isStale(ep, tick)}<!-- A day without a reading (#115): the line ends asking. -->{' · '}<strong class="still">{t('episode.stillQ')}</strong>{/if}</span>
            </button>
          {/each}
        {/snippet}
      </Dropdown>
    {/if}
    <Dropdown label={t('preset.strip')} cls="presets" end>
      {#snippet trigger()}
        <span class="name">{t('preset.strip')}</span>
        {@render chevron()}
      {/snippet}
      {#snippet items(close)}
        {#each presets.value as p (p.id)}
          {@const last = lastBy.value[p.id]}
          {@const hl = last ? entryHeadline(last) : null}
          <button role="menuitem" onclick={() => {
              close()
              presetOpen = p
            }}>
            {#if hl}<span class="dot" style="background: {intensityColor(hl.value)}; color: {intensityInk(hl.value)}">{isRead(last.layers) ? hl.value : '–'}</span>{:else}<span class="dot empty"></span>{/if}
            <span class="grow">{p.name} · {last ? formatDuration(Math.max(0, tick - Date.parse(last.at)), units) : t('preset.never')}</span>
          </button>
        {/each}
        <button role="menuitem" class="new" onclick={() => {
            close()
            newPreset()
          }}>
          <span class="dot plus" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg></span>
          {t('preset.new')}
        </button>
      {/snippet}
    </Dropdown>
  </div>

  <!-- One banner at a time (#37): installing is what keeps the data safe, so it goes first; the backup waits its turn. -->
  {#if installNudge}
    <div class="msg standing nudge small">
      <MessageIcon name="needs" />
      <span class="grow">{t('install.nudge')}</span>
      <button class="chip small" onclick={installNow}>{t('install.now')}</button>
      <button class="chip small outline" onclick={() => (install.dismissed = true)} aria-label={t('install.later')}>✕</button>
    </div>
  {:else if nudge}
    <div class="msg standing nudge small">
      <MessageIcon name="needs" />
      {#if nudge.drive}
        <span class="grow">{nudge.days === null ? t('drive.never') : tn('backup.nudgeDrive', nudge.days)}</span>
        <button class="chip small" onclick={driveNow}>{t('drive.backup')}</button>
      {:else}
        <span class="grow">{t('backup.nudge')}</span>
        <button class="chip small" onclick={fileBackup}>{t('backup.now')}</button>
      {/if}
      <button class="chip small outline" onclick={snooze} aria-label={t('backup.later')}>✕</button>
    </div>
  {/if}

  <!-- The slot over the frame (#22): the form draws the figure, the frame carries the fast path and the Salva bar. -->
  <EntryForm bind:this={form} bind:draft bind:peek bind:opened symptoms={symptoms.value} tags={tags.value}>
    {#snippet actions()}
      <div class="actions">
        <button class="btn" onclick={clear} disabled={!dirty}>{t('log.clear')}</button>
        <button class="btn primary grow" onclick={save} disabled={saving || cooling || outdated.value}>{t('log.save')}</button>
      </div>
    {/snippet}
  </EntryForm>
</div>
{#snippet chevron()}
  <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
{/snippet}

<!-- Nuovo preset makes the preset and nothing else: the log form stays a plain entry (§5.6). -->
<PresetForm bind:seed={presetSeed} symptoms={symptoms.value} />
<PresetSheet bind:preset={presetOpen} symptoms={symptoms.value} />
<EpisodeSheet bind:entry={episode} tagDefs={tags.value} symptoms={symptoms.value} onedit={(e) => (editing = e)} />
<EditSheet bind:entry={editing} symptoms={symptoms.value} tags={tags.value} />
<Sheet bind:open={howTo} title={t('install.title')}>
  <p>{t(isIOS() ? 'install.ios' : 'install.android')}</p>
  <p class="small muted">{t('install.why')}</p>
  <!-- Instructions to read and then act on elsewhere: a visible way out, besides the backdrop and back (§6.1). -->
  <button class="btn block" onclick={() => (howTo = false)}>{t('common.close')}</button>
</Sheet>

<style>
  .still { color: var(--accent); white-space: nowrap; }
  /* Nothing scrolls here (§6.1): the slot takes what the frame leaves. Only when the banners crowd it does the page give, so Salva is always reachable. */
  .log { padding-bottom: 0; }
  .log > :global(.form) { min-height: 440px; }
  /* The text keeps a readable measure: on a narrow (zoomed) page it takes its own line and the buttons wrap under it. */
  /* A standing message (#94): it stays in the page until acted on; on a narrow page its buttons wrap under the words. */
  .nudge { flex: none; flex-wrap: wrap; row-gap: 6px; }
  .nudge > .grow { flex: 1 1 9em; }
  /* The row of dropdowns: the screens and what is going on at the left, the presets at the right edge. */
  /* On a narrow (zoomed) page the row wraps rather than squeezing a label to a letter. */
  .top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; flex: none; min-width: 0; }
  .top :global(.chev) { flex: none; width: 16px; height: 16px; }
  .top .name { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  /* Something is going on: filled with the colour of the highest level; the menu has the numbers. */
  .top :global(.episodes) { font-weight: 600; max-width: 100%; }
  /* Pressed while the form carries a preset; the menu ticks which one. */
  .top :global(.presets) { max-width: 100%; }
  .dot { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }
  .dot.empty { background: var(--surface-2); }
  .dot.plus { background: transparent; border: 1.5px solid var(--border); }
  .dot.plus svg { width: 14px; height: 14px; }
  /* No tab bar under the drawer any more: it keeps clear of the gesture bar itself. */
  .log :global(.drawer .inner) { padding-bottom: calc(8px + env(safe-area-inset-bottom)); }
  .actions { display: flex; gap: 10px; flex: none; }
  .actions .btn.primary { min-height: 56px; font-size: 18px; }
  .actions .btn:not(.primary) { min-height: 56px; padding: 0 18px; }
</style>
