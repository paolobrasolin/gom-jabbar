<script lang="ts">
  import Sheet from '../components/Sheet.svelte'
  import VocabEditor from '../components/VocabEditor.svelte'
  import { t, locale } from '../i18n/index.svelte'
  import { prefs, savePrefs, type Theme } from '../lib/prefs.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import type { Lang } from '../lib/types'
  import { buildExport, parseImport, previewImport, applyImport, toCsv, shareOrDownload, exportFilename, type ExportFile, type ImportPreview } from '../lib/backup'
  import { showToast, haptic } from '../lib/toast.svelte'

  const count = live(() => null, () => db.entries.count(), 0)
  const standalone = typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)

  function setLang(l: Lang) {
    prefs.lang = l
    savePrefs()
  }
  function setTheme(th: Theme) {
    prefs.theme = th
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

  async function exportCsv() {
    if (busy) return
    busy = true
    try {
      const file = await buildExport()
      const csv = toCsv(file.entries, file.vocabulary.symptoms, file.vocabulary.tags, prefs.lang, t)
      await shareOrDownload(exportFilename('csv'), csv, 'text/csv')
      haptic(20)
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
    try {
      const file = parseImport(await f.text())
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
</script>

<div class="screen">
  {#if !standalone}
    <div class="card small">{t('settings.install')}</div>
  {/if}

  <div class="card">
    <p class="small muted label">{t('settings.backup')}</p>
    <p class="small muted">{lastBackup ? t('settings.lastBackup', { d: lastBackup }) : t('settings.neverBackedUp')}</p>
    <div class="chips top">
      <button class="chip" onclick={exportJson} disabled={busy}>{t('settings.exportJson')}</button>
      <button class="chip outline" onclick={exportCsv} disabled={busy}>{t('settings.exportCsv')}</button>
      <button class="chip outline" onclick={() => fileInput?.click()} disabled={busy}>{t('settings.import')}</button>
      <input class="sr-only" type="file" accept="application/json,.json,text/plain,.txt" bind:this={fileInput} onchange={onFile} tabindex="-1" aria-hidden="true" />
    </div>
    <p class="small muted top">{t('settings.dataNote')} · {t('settings.entriesCount', { n: count.value })}</p>
  </div>

  <div class="card">
    <p class="small muted label">{t('settings.vocabulary')}</p>
    <div class="chips">
      <button class="chip outline" onclick={() => { vocab = 'symptoms'; vocabOpen = true }}>{t('settings.vocab.symptoms')}</button>
      <button class="chip outline" onclick={() => { vocab = 'tags'; vocabOpen = true }}>{t('settings.vocab.tags')}</button>
    </div>
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
    <p class="small muted label">{t('settings.help')}</p>
    <ul class="help">
      {#each ['tap', 'limb', 'level', 'areas', 'ongoing', 'time', 'undo', 'edit', 'backup'] as k (k)}
        <li>{t(`help.${k}`)}</li>
      {/each}
    </ul>
  </div>
</div>

<Sheet bind:open={vocabOpen} title={vocab === 'tags' ? t('settings.vocab.tags') : t('settings.vocab.symptoms')}>
  {#if vocab}<VocabEditor table={vocab} />{/if}
</Sheet>

<Sheet bind:open={importOpen} title={t('settings.import')}>
  {#if pending}
    <div class="card small">
      <p>{t('import.summary', { n: pending.preview.entries, d: new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(new Date(pending.file.exportedAt)) })}</p>
      <p class="muted">{t('import.mergeInfo', { a: pending.preview.added, u: pending.preview.updated })}</p>
    </div>
    <button class="btn primary block" onclick={() => doImport('merge')}>{t('import.merge')}</button>
    <button class="btn block" onclick={() => doImport('replace')}>{t('import.replace', { n: count.value })}</button>
  {/if}
</Sheet>

<style>
  .label { margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
  .top { margin-top: 10px; }
  .help { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 15px; }
  .chip:disabled { opacity: 0.5; }
</style>
