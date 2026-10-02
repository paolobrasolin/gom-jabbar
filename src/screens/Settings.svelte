<script lang="ts">
  import Sheet from '../components/Sheet.svelte'
  import VocabEditor from '../components/VocabEditor.svelte'
  import PresetForm, { type PresetSeed } from '../components/PresetForm.svelte'
  import DriveZone from '../components/DriveZone.svelte'
  import type { CloudProvider, Resumed } from '../lib/cloud'
  import { driveInUse } from '../lib/cloudBackup'
  import { resetAll } from '../lib/reset'
  import { t, locale, tn } from '../i18n/index.svelte'
  import { prefs, savePrefs, type Theme } from '../lib/prefs.svelte'
  import type { FigureId } from '../lib/figures'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import type { Lang } from '../lib/types'
  import { parseImport, previewImport, applyImport, shareOrDownload, exportFilename, type ExportFile, type ImportPreview } from '../lib/backup'
  import { showToast, showFailure, showRefusal, haptic } from '../lib/toast.svelte'
  import { fileBackup } from '../lib/fileBackup'
  import { failed } from '../lib/failure'
  import { deletePreset, restorePreset } from '../lib/presets'
  import { listSnapshots, type Snapshot } from '../lib/snapshots'

  let { cloud, resume = null, onresumed = () => {}, reload }: { cloud: CloudProvider; resume?: Resumed; onresumed?: () => void; reload: () => void } = $props()

  const count = live(() => null, () => db.entries.count(), 0)
  const presets = live(() => null, () => db.presets.orderBy('order').toArray(), [])
  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  /** The copies the app keeps of the diary (§4.1): before an upgrade, a replace, a merge. Newest first. */
  const snapshots = live(() => null, listSnapshots, [])
  const when = (iso: string) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  /** Modifica opens the preset form on the preset (§5.6): edited in place, its stream of entries stays with it. */
  let presetSeed = $state.raw<PresetSeed | null>(null)
  async function removePreset(id: string) {
    const gone = await deletePreset(id)
    haptic(20)
    if (gone) showToast(t('preset.deleted'), { label: t('log.undo'), run: () => void restorePreset(gone).catch(failed) })
  }
  const standalone = typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)

  function setLang(l: Lang) {
    prefs.lang = l
    savePrefs()
  }
  function setTheme(th: Theme) {
    prefs.theme = th
    savePrefs()
  }
  function setFigure(f: FigureId) {
    prefs.figure = f
    savePrefs()
  }

  let busy = $state(false)
  let vocab = $state<'symptoms' | 'tags' | null>(null)
  let vocabOpen = $state(false)
  $effect(() => {
    if (!vocabOpen) vocab = null
  })

  const lastBackup = $derived(
    prefs.lastBackupAt ? new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(prefs.lastBackupAt)) : null,
  )

  async function exportJson() {
    if (busy) return
    busy = true
    try {
      await fileBackup()
    } finally {
      busy = false
    }
  }

  let fileInput: HTMLInputElement | undefined = $state()
  /** What the Ripristina sheet shows: a backup file, or one of the app's own copies (`copy`), which is no backup. */
  let pending = $state.raw<{ file: ExportFile; preview: ImportPreview; copy?: Snapshot } | null>(null)
  let importOpen = $state(false)
  $effect(() => {
    if (!importOpen) pending = null
  })

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    await openImport(await f.text())
  }

  /** A backup's text, from the file picker or from Drive, into the preview (merge or replace). */
  async function openImport(text: string) {
    try {
      const file = parseImport(text)
      pending = { file, preview: await previewImport(file) }
      importOpen = true
    } catch (err) {
      showRefusal(t((err as Error).message === 'newer-version' ? 'import.newer' : 'import.invalid'))
    }
  }

  /** One of the app's copies into the same preview (§4.1): its file is a backup like any other. */
  async function openCopy(copy: Snapshot) {
    pending = { file: copy.file, preview: await previewImport(copy.file), copy }
    importOpen = true
  }

  /** A copy out of the phone, as a backup file. It is the diary as it was then: it does not count as a backup now. */
  async function downloadCopy() {
    if (!pending?.copy || busy) return
    busy = true
    try {
      const name = exportFilename('json', new Date(pending.copy.takenAt)).replace('gom-jabbar-', 'gom-jabbar-copia-')
      await shareOrDownload(name, JSON.stringify(pending.copy.file, null, 1), 'application/json')
      haptic(20)
      showToast(t('copy.done'))
    } catch (err) {
      if ((err as Error).name !== 'AbortError') showFailure(t('backup.failed'))
    } finally {
      busy = false
    }
  }

  /** A restore in flight: the second tap of a double tap does nothing, and the file is read before the first wait. */
  async function doImport(mode: 'merge' | 'replace') {
    if (!pending || busy) return
    busy = true
    const { file } = pending
    let res: Awaited<ReturnType<typeof applyImport>>
    try {
      res = await applyImport(file, mode)
    } catch (err) {
      const e = err as Error & { inner?: Error }
      console.error('import failed', e.name, e.message, e.inner?.name, e.inner?.message, e)
      showFailure(t('import.failed'))
      return
    } finally {
      busy = false
    }
    importOpen = false
    haptic(20)
    // The file is a backup made when it was exported (§4.2): restoring it says so, unless a later backup is known, so the
    // banner does not ask for one straight after a restore (a new phone, or after Cancella tutto).
    // One of the app's own copies never left the phone: no backup.
    if (!pending?.copy && (!prefs.lastBackupAt || file.exportedAt > prefs.lastBackupAt)) {
      prefs.lastBackupAt = file.exportedAt
      savePrefs()
    }
    const msg = tn('import.done', mode === 'replace' ? res.entries : res.added + res.updated)
    // The undo restores the copy the restore kept (§4.1), which stays in Copie automatiche after the undo's ten seconds.
    const copy = res.copy
    showToast(msg, { label: t('log.undo'), run: () => void applyImport(copy.file, 'replace').catch(failed) })
  }

  /** Cancella tutto (§6.4): the app's one confirmation, a typed word, because there is no undo. */
  let resetOpen = $state(false)
  let resetWord = $state('')
  let resetting = $state(false)
  $effect(() => {
    if (!resetOpen) resetWord = ''
  })
  const resetArmed = $derived(resetWord.trim().toLowerCase() === t('reset.word'))
  async function resetNow() {
    if (!resetArmed || resetting) return
    resetting = true
    try {
      await resetAll(cloud)
    } catch (e) {
      // The diary is deleted in one step: when that fails it is all there. Say so, and let the button be pressed again.
      console.error(e)
      resetting = false
      showFailure(t('reset.failed'))
      return
    }
    reload()
  }

  /** The footer (§6.4): the version, the day of its commit, the build; the pages open at the part in the app's language. */
  const [version, build = ''] = __APP_VERSION__.split('+')
  const released = $derived(new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${__APP_DATE__}T12:00:00`)))
  const page = (name: string) => `${import.meta.env.BASE_URL}${name}.html${prefs.lang === 'it' ? '#it' : ''}`
</script>

<div class="screen">
  {#if !standalone}
    <div class="card small">{t('settings.install')}</div>
  {/if}

  <!-- One card (§6.4): Drive first, the one-tap path the banner uses; then the file on the share sheet; then the app's own copies. -->
  <section class="card" aria-labelledby="backup-title">
    <p class="small muted label" id="backup-title">{t('settings.backup')}</p>
    <p class="small muted">{t('settings.dataNote')} · {tn('settings.entriesCount', count.value)}</p>
    <p class="small muted">{lastBackup ? t('settings.lastBackup', { d: lastBackup }) : t('settings.neverBackedUp')}</p>
    {#if cloud.available}
      <DriveZone {cloud} resumed={resume} {onresumed} onrestore={openImport} />
    {/if}
    <div class="zone" role="group" aria-labelledby="backup-file">
      <p class="small zlabel" id="backup-file">{t('settings.backup.file')}</p>
      <div class="chips">
        <button class="chip" onclick={exportJson} disabled={busy}>{t('settings.exportJson')}</button>
        <button class="chip outline" onclick={() => fileInput?.click()} disabled={busy}>{t('settings.import')}</button>
        <input class="sr-only" type="file" accept="application/json,.json,text/plain,.txt" bind:this={fileInput} onchange={onFile} tabindex="-1" aria-hidden="true" />
      </div>
    </div>
    {#if snapshots.value.length}
      <!-- The app's own copies (§4.1): there only once one was taken. -->
      <div class="zone" role="group" aria-labelledby="backup-copies">
        <p class="small zlabel" id="backup-copies">{t('settings.backup.copies')}</p>
        <div class="plist">
          {#each snapshots.value as s (s.id)}
            <div class="row copy">
              <span class="grow small">{t(`copy.${s.reason}`)} · {when(s.takenAt)}</span>
              <button class="chip small outline" onclick={() => openCopy(s)} disabled={busy}>{t('copy.open')}</button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </section>

  <div class="card">
    <p class="small muted label">{t('settings.vocabulary')}</p>
    <div class="chips">
      <button class="chip outline" onclick={() => { vocab = 'symptoms'; vocabOpen = true }}>{t('settings.vocab.symptoms')}</button>
      <button class="chip outline" onclick={() => { vocab = 'tags'; vocabOpen = true }}>{t('settings.vocab.tags')}</button>
    </div>
  </div>

  <div class="card">
    <p class="small muted label">{t('settings.presets')}</p>
    {#if presets.value.length}
      <div class="plist">
        {#each presets.value as p (p.id)}
          <div class="row preset">
            <span class="grow name">{p.name}</span>
            <button class="chip small outline" onclick={() => (presetSeed = { preset: p })} aria-label="{t('diary.edit')} {p.name}">{t('diary.edit')}</button>
            <button class="chip small outline" onclick={() => removePreset(p.id)} aria-label="{t('diary.delete')} {p.name}">{t('diary.delete')}</button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="small muted">{t('preset.none')}</p>
    {/if}
  </div>

  <div class="card">
    <p class="small muted label">{t('settings.language')}</p>
    <div class="chips">
      <button class="chip" aria-pressed={prefs.lang === 'it'} onclick={() => setLang('it')}>Italiano</button>
      <button class="chip" aria-pressed={prefs.lang === 'en'} onclick={() => setLang('en')}>English</button>
    </div>
  </div>

  <div class="card">
    <p class="small muted label">{t('settings.theme')}</p>
    <div class="chips">
      {#each ['system', 'light', 'dark'] as const as th (th)}
        <button class="chip" aria-pressed={prefs.theme === th} onclick={() => setTheme(th)}>{t(`settings.theme.${th}`)}</button>
      {/each}
    </div>
  </div>

  <div class="card">
    <p class="small muted label">{t('settings.figure')}</p>
    <div class="chips">
      {#each ['female', 'male'] as const as f (f)}
        <button class="chip" aria-pressed={prefs.figure === f} onclick={() => setFigure(f)}>{t(`settings.figure.${f}`)}</button>
      {/each}
    </div>
  </div>

  <div class="card">
    <p class="small muted label">{t('reset.title')}</p>
    <p class="small muted">{t('reset.card')}</p>
    <div class="chips top">
      <button class="chip outline danger" onclick={() => (resetOpen = true)}>{t('reset.title')}</button>
    </div>
  </div>

  <footer class="small muted center about">
    <p>Gom Jabbar {version} · {released} · {build}</p>
    <p><a href="mailto:paolo.brasolin@gmail.com">paolo.brasolin@gmail.com</a> · <a href="https://github.com/paolobrasolin/gom-jabbar">{t('about.source')}</a></p>
    <p>
      <a href={page('privacy-policy')}>{t('about.privacy')}</a> · <a href={page('terms-of-service')}>{t('about.terms')}</a> ·
      <a href={page('open-source-licences')}>{t('about.licences')}</a>
    </p>
  </footer>
</div>

<Sheet bind:open={vocabOpen} title={vocab === 'tags' ? t('settings.vocab.tags') : t('settings.vocab.symptoms')}>
  {#if vocab}<VocabEditor table={vocab} />{/if}
</Sheet>

<Sheet bind:open={importOpen} title={t('import.title')}>
  {#if pending}
    <div class="card small">
      <p>{tn(pending.copy ? 'import.copySummary' : 'import.summary', pending.preview.entries, { d: new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(new Date(pending.file.exportedAt)) })}</p>
      <p class="muted">{t('import.mergeInfo', { a: tn('import.added', pending.preview.added), u: tn('import.updated', pending.preview.updated) })}</p>
    </div>
    <button class="btn primary block" onclick={() => doImport('merge')} disabled={busy}>{t('import.merge')}</button>
    <button class="btn block" onclick={() => doImport('replace')} disabled={busy}>{tn('import.replace', count.value)}</button>
    {#if pending.copy}<button class="btn block" onclick={downloadCopy} disabled={busy}>{t('copy.download')}</button>{/if}
  {/if}
</Sheet>

<PresetForm bind:seed={presetSeed} symptoms={symptoms.value} />

<Sheet bind:open={resetOpen} title={t('reset.title')}>
  <div class="card small">
    <p>{t('reset.what')}</p>
    <p class="muted">{lastBackup ? t('reset.lastBackup', { d: lastBackup }) : t('reset.noBackup')}</p>
    {#if driveInUse(cloud)}<p class="muted">{t('reset.drive')}</p>{/if}
  </div>
  <label class="small word">
    {t('reset.type', { w: t('reset.word') })}
    <input type="text" bind:value={resetWord} autocomplete="off" autocapitalize="off" spellcheck="false" />
  </label>
  <button class="btn block wipe" onclick={resetNow} disabled={!resetArmed || resetting}>{t('reset.title')}</button>
</Sheet>

<style>
  .label { margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
  .chip:disabled { opacity: 0.55; }
  .center { text-align: center; }
  .about { margin: 8px 0 16px; }
  .about p { margin: 0; line-height: 48px; }
  /* The app's only links: the theme's accent (contrast in both themes) and a 48px target like every control (§10). */
  .about a { color: var(--accent); display: inline-block; padding: 0 2px; }
  .top { margin-top: 10px; }
  .chip.danger { color: var(--danger); }
  .word { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; }
  .word input { font: inherit; font-size: 17px; padding: 10px 12px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--surface); color: var(--ink); }
  .wipe { background: var(--danger); color: #fff; }
  .plist { display: flex; flex-direction: column; gap: 4px; }
  .preset, .copy { min-height: 40px; }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
