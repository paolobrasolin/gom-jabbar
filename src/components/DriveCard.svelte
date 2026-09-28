<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import Sheet from './Sheet.svelte'
  import { t, locale } from '../i18n/index.svelte'
  import type { CloudProvider, Failure, RestorePoint, Resumed } from '../lib/cloud'
  import { buildExport } from '../lib/backup'
  import { prefs, savePrefs } from '../lib/prefs.svelte'
  import { showToast, haptic } from '../lib/toast.svelte'

  /**
   * The Drive backup on trial (§4.2): one tap backs up, leaving for Google's consent screen first when there is no
   * live token; `resumed` is that tap coming back, finished once on mount.
   */
  let {
    cloud,
    resumed = null,
    onresumed = () => {},
    onrestore,
  }: { cloud: CloudProvider; resumed?: Resumed; onresumed?: () => void; onrestore: (text: string) => void } = $props()

  let status = $state.raw(untrack(() => cloud.status()))
  let now = $state(Date.now())
  let busy = $state(false)
  let problem = $state.raw<{ reason: Failure; status?: number; remoteAt?: string } | null>(null)
  let points = $state.raw<RestorePoint[]>([])
  let pointsOpen = $state(false)

  function refresh() {
    status = cloud.status()
    now = Date.now()
  }
  const when = (iso: string) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  const problemText = $derived(
    !problem
      ? ''
      : problem.reason === 'http'
        ? t('drive.error.http', { s: problem.status ?? '?' })
        : problem.reason === 'conflict'
          ? t('drive.error.conflict', { d: when(problem.remoteAt!) })
          : t(`drive.error.${problem.reason}`),
  )

  /** Runs one provider step with the card busy; without a live token the tap leaves for Google instead. */
  async function step(intent: 'backup' | 'restore', body: () => Promise<void>) {
    if (busy) return
    if (!cloud.status().expiresAt) return cloud.connect(intent)
    busy = true
    problem = null
    try {
      if (!cloud.status().account) await cloud.whoami()
      await body()
    } finally {
      busy = false
      refresh()
    }
  }

  const backup = (force = false) =>
    step('backup', async () => {
      const res = await cloud.put(JSON.stringify(await buildExport(), null, 1), { force })
      if (!res.ok) return void (problem = res)
      prefs.lastBackupAt = new Date().toISOString()
      prefs.backupSnoozedUntil = null
      savePrefs()
      haptic(20)
      showToast(t('drive.done'))
    })

  const restore = () =>
    step('restore', async () => {
      const res = await cloud.list()
      if (!res.ok) return void (problem = res)
      points = res.value
      pointsOpen = true
    })

  async function pick(p: RestorePoint) {
    if (busy) return
    busy = true
    problem = null
    try {
      const res = await cloud.get(p.id)
      if (!res.ok) return void (problem = res)
      pointsOpen = false
      onrestore(res.value)
    } finally {
      busy = false
      refresh()
    }
  }

  async function disconnect() {
    await cloud.disconnect()
    problem = null
    refresh()
    showToast(t('drive.disconnected'))
  }

  onMount(() => {
    const r = resumed
    if (r) {
      onresumed()
      if (r.error) problem = { reason: r.error }
      else if (r.intent === 'backup') void backup()
      else void restore()
    }
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  })
</script>

<section class="card" aria-labelledby="drive-title">
  <p class="small muted label" id="drive-title">{t('drive.title')}</p>
  {#if status.account}<p class="small">{t('drive.account', { a: status.account.email })}</p>{/if}
  <p class="small muted">
    {status.expiresAt ? t('drive.connected', { n: Math.max(1, Math.round((status.expiresAt - now) / 60_000)) }) : t('drive.notConnected')}
  </p>
  <p class="small muted">{status.lastWriteAt ? t('drive.last', { d: when(status.lastWriteAt) }) : t('drive.never')}</p>
  <div class="chips top">
    <button class="chip" onclick={() => backup()} disabled={busy}>{t('drive.backup')}</button>
    <button class="chip outline" onclick={restore} disabled={busy}>{t('drive.restore')}</button>
    {#if status.expiresAt || status.account || status.lastWriteAt}
      <button class="chip outline" onclick={disconnect} disabled={busy}>{t('drive.disconnect')}</button>
    {/if}
  </div>
  {#if problem}
    <p class="small problem top" role="alert">{problemText}</p>
    {#if problem.reason === 'conflict'}
      <div class="chips top">
        <button class="chip outline" onclick={restore} disabled={busy}>{t('drive.restore')}</button>
        <button class="chip outline" onclick={() => backup(true)} disabled={busy}>{t('drive.overwrite')}</button>
      </div>
    {/if}
  {/if}
</section>

<Sheet bind:open={pointsOpen} title={t('drive.restore')}>
  {#if points.length}
    <div class="points">
      {#each points as p (p.id)}
        <button class="btn block" onclick={() => pick(p)} disabled={busy}>
          {when(p.at)} · {t('drive.size', { n: Math.max(1, Math.round(p.size / 1024)) })}{p.id === 'head' ? ` · ${t('drive.current')}` : ''}
        </button>
      {/each}
    </div>
  {:else}
    <p class="small muted">{t('drive.none')}</p>
  {/if}
</Sheet>

<style>
  .label { margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
  .top { margin-top: 10px; }
  .chip:disabled { opacity: 0.55; }
  .problem { color: var(--danger); }
  .points { display: flex; flex-direction: column; gap: 8px; }
</style>
