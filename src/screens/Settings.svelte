<script lang="ts">
  import Sheet from '../components/Sheet.svelte'
  import VocabEditor from '../components/VocabEditor.svelte'
  import PresetForm, { type PresetSeed } from '../components/PresetForm.svelte'
  import DriveZone from '../components/DriveZone.svelte'
  import type { CloudProvider, Resumed } from '../lib/cloud'
  import { driveInUse } from '../lib/cloudBackup'
  import { resetAll } from '../lib/reset'
  import { t, locale } from '../i18n/index.svelte'
  import { prefs, savePrefs, type Theme } from '../lib/prefs.svelte'
  import type { FigureId } from '../lib/figures'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import type { Lang } from '../lib/types'
  import { buildExport, parseImport, previewImport, applyImport, shareOrDownload, exportFilename, type ExportFile, type ImportPreview } from '../lib/backup'
  import { showToast, haptic } from '../lib/toast.svelte'
  import { deletePreset, restorePreset } from '../lib/presets'

  let { cloud, resume = null, onresumed = () => {}, reload }: { cloud: CloudProvider; resume?: Resumed; onresumed?: () => void; reload: () => void } = $props()

  const count = live(() => null, () => db.entries.count(), 0)
  const presets = live(() => null, () => db.presets.orderBy('order').toArray(), [])
  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  /** Modifica opens the preset form on the preset (§5.6): edited in place, its stream of entries stays with it. */
  let presetSeed = $state.raw<PresetSeed | null>(null)
  async function removePreset(id: string) {
    const gone = await deletePreset(id)
    haptic(20)
    if (gone) showToast(t('preset.deleted'), { label: t('log.undo'), run: () => void restorePreset(gone) })
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
      const file = await buildExport()
      await shareOrDownload(exportFilename('json'), JSON.stringify(file, null, 1), 'application/json')
      prefs.lastBackupAt = new Date().toISOString()
      prefs.backupSnoozedUntil = null
      savePrefs()
      haptic(20)
      showToast(t('backup.done'))
    } catch (err) {
      if ((err as Error).name !== 'AbortError') showToast(t('backup.failed'))
    } finally {
      busy = false
    }
  }

  let fileInput: HTMLInputElement | undefined = $state()
  let pending = $state.raw<{ file: ExportFile; preview: ImportPreview } | null>(null)
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
    } catch {
      showToast(t('import.invalid'))
    }
  }

  async function doImport(mode: 'merge' | 'replace') {
    if (!pending) return
    let res: ImportPreview
    let snapshot: ExportFile | null = null
    try {
      snapshot = mode === 'replace' ? await buildExport() : null
      res = await applyImport(pending.file, mode)
    } catch (err) {
      const e = err as Error & { inner?: Error }
      console.error('import failed', e.name, e.message, e.inner?.name, e.inner?.message, e)
      showToast(t('import.failed'))
      return
    }
    importOpen = false
    haptic(20)
    const msg = t('import.done', { n: mode === 'replace' ? res.entries : res.added + res.updated })
    if (snapshot) showToast(msg, { label: t('log.undo'), run: () => void applyImport(snapshot, 'replace') })
    else showToast(msg)
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
    await resetAll(cloud)
    reload()
  }
</script>

<div class="screen">
  {#if !standalone}
    <div class="card small">{t('settings.install')}</div>
  {/if}

  <!-- One card, two zones (§6.4): Drive first, the one-tap path the banner uses; then the file on the share sheet. -->
  <section class="card" aria-labelledby="backup-title">
    <p class="small muted label" id="backup-title">{t('settings.backup')}</p>
    <p class="small muted">{t('settings.dataNote')} · {t('settings.entriesCount', { n: count.value })}</p>
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
    <p class="small muted label">{t('settings.help')}</p>
    <ul class="help">
      {#each ['tap', 'limb', 'level', 'areas', 'ongoing', 'time', 'undo', 'edit', 'backup'] as k (k)}
        <li>{t(`help.${k}`)}</li>
      {/each}
    </ul>
  </div>

  <div class="card">
    <p class="small muted label">{t('reset.title')}</p>
    <p class="small muted">{t('reset.card')}</p>
    <div class="chips top">
      <button class="chip outline danger" onclick={() => (resetOpen = true)}>{t('reset.title')}</button>
    </div>
  </div>

  <p class="small muted center">{t('settings.version', { v: __APP_VERSION__ })} · <a href="{import.meta.env.BASE_URL}privacy.html">{t('settings.privacy')}</a></p>
</div>

<Sheet bind:open={vocabOpen} title={vocab === 'tags' ? t('settings.vocab.tags') : t('settings.vocab.symptoms')}>
  {#if vocab}<VocabEditor table={vocab} />{/if}
</Sheet>

<Sheet bind:open={importOpen} title={t('import.title')}>
  {#if pending}
    <div class="card small">
      <p>{t('import.summary', { n: pending.preview.entries, d: new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(new Date(pending.file.exportedAt)) })}</p>
      <p class="muted">{t('import.mergeInfo', { a: pending.preview.added, u: pending.preview.updated })}</p>
    </div>
    <button class="btn primary block" onclick={() => doImport('merge')}>{t('import.merge')}</button>
    <button class="btn block" onclick={() => doImport('replace')}>{t('import.replace', { n: count.value })}</button>
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
  .help { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 15px; }
  .chip:disabled { opacity: 0.55; }
  .center { text-align: center; }
  .top { margin-top: 10px; }
  .chip.danger { color: var(--danger); }
  .word { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; }
  .word input { font: inherit; font-size: 17px; padding: 10px 12px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--surface); color: var(--ink); }
  .wipe { background: var(--danger); color: #fff; }
  .plist { display: flex; flex-direction: column; gap: 4px; }
  .preset { min-height: 40px; }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
