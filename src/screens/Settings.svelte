<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { prefs, savePrefs, type Theme } from '../lib/prefs.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import type { Lang } from '../lib/types'

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
</script>

<div class="screen">
  {#if !standalone}
    <div class="card small">{t('settings.install')}</div>
  {/if}

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
      {#each ['tap', 'limb', 'level', 'areas', 'ongoing', 'time', 'undo', 'edit'] as k (k)}
        <li>{t(`help.${k}`)}</li>
      {/each}
    </ul>
  </div>

  <div class="card small muted">
    <p>{t('settings.entriesCount', { n: count.value })}</p>
    <p>{t('settings.dataNote')}</p>
  </div>
</div>

<style>
  .help { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 15px; }
  .label { margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
</style>
