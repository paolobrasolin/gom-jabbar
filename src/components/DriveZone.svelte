<script lang="ts">
  /** Where a Google account lists and removes the apps it has granted access to. */
  const PERMISSIONS = 'https://myaccount.google.com/permissions'
  import { onMount, untrack } from 'svelte'
  import Sheet from './Sheet.svelte'
  import { t } from '../i18n/index.svelte'
  import type { CloudProvider, Failure, RestorePoint, Resumed } from '../lib/cloud'
  import { cloudBackup, driveTime, failureText } from '../lib/cloudBackup'
  import { showToast, haptic } from '../lib/toast.svelte'

  /**
   * The Drive zone of the Backup card (§4.2, §6.4): one tap backs up, leaving for Google's consent screen first when
   * there is no live token; `resumed` is that tap coming back, finished once on mount.
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

  /** One provider step with the zone busy; the problem line shows what it left behind. */
  async function step(body: () => Promise<void>) {
    if (busy) return
    busy = true
    problem = null
    try {
      await body()
    } finally {
      busy = false
      refresh()
    }
  }

  const backup = (force = false) =>
    step(async () => {
      const res = await cloudBackup(cloud, { force })
      if (res === 'left') return
      if (!res.ok) return void (problem = res)
      haptic(20)
      showToast(t('drive.done'))
    })

  const restore = () => {
    if (!cloud.status().expiresAt) return cloud.connect('restore')
    return step(async () => {
      if (!cloud.status().account) await cloud.whoami()
      const res = await cloud.list()
      if (!res.ok) return void (problem = res)
      points = res.value
      pointsOpen = true
    })
  }

  const pick = (p: RestorePoint) =>
    step(async () => {
      const res = await cloud.get(p.id)
      if (!res.ok) return void (problem = res)
      pointsOpen = false
      onrestore(res.value)
    })

  /**
   * Scollega (§4.2): forgotten here always; revoked with Google only while the hour-long token lives. Otherwise say so
   * honestly and offer Google's own page, where the permission can be removed.
   */
  async function disconnect() {
    const revoked = await cloud.disconnect()
    problem = null
    refresh()
    if (revoked) showToast(t('drive.disconnected'))
    else showToast(t('drive.forgotten'), { label: t('drive.removePermission'), run: () => void window.open(PERMISSIONS, '_blank', 'noopener') })
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

<div class="zone" role="group" aria-labelledby="backup-drive">
  <p class="small zlabel" id="backup-drive">{t('drive.title')}</p>
  {#if status.account}<p class="small">{t('drive.account', { a: status.account.email })}</p>{/if}
  <p class="small muted">
    {status.expiresAt ? t('drive.connected', { n: Math.max(1, Math.round((status.expiresAt - now) / 60_000)) }) : t('drive.notConnected')}
  </p>
  <p class="small muted">{status.lastWriteAt ? t('drive.last', { d: driveTime(status.lastWriteAt) }) : t('drive.never')}</p>
  <div class="chips top">
    <button class="chip" onclick={() => backup()} disabled={busy}>{t('drive.backup')}</button>
    <button class="chip outline" onclick={restore} disabled={busy}>{t('drive.restore')}</button>
    {#if status.expiresAt || status.account || status.lastWriteAt}
      <button class="chip outline" onclick={disconnect} disabled={busy}>{t('drive.disconnect')}</button>
    {/if}
  </div>
  {#if problem}
    <p class="small problem top" role="alert">{failureText(problem)}</p>
    {#if problem.reason === 'conflict'}
      <div class="chips top">
        <button class="chip outline" onclick={restore} disabled={busy}>{t('drive.restore')}</button>
        <button class="chip outline" onclick={() => backup(true)} disabled={busy}>{t('drive.overwrite')}</button>
      </div>
    {/if}
  {/if}
</div>

<Sheet bind:open={pointsOpen} title={t('drive.restore')}>
  {#if points.length}
    <div class="points">
      {#each points as p (p.id)}
        <button class="btn block" onclick={() => pick(p)} disabled={busy}>
          {driveTime(p.at)} · {t('drive.size', { n: Math.max(1, Math.round(p.size / 1024)) })}{p.id === 'head' ? ` · ${t('drive.current')}` : ''}
        </button>
      {/each}
    </div>
  {:else}
    <p class="small muted">{t('drive.none')}</p>
  {/if}
</Sheet>

<style>
  .top { margin-top: 10px; }
  .chip:disabled { opacity: 0.55; }
  .problem { color: var(--danger); }
  .points { display: flex; flex-direction: column; gap: 8px; }
</style>
