<script lang="ts">
  import Sheet from './Sheet.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import { t, locale } from '../i18n/index.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { endEpisode, reopenEpisode, updateEpisodeIntensity, durationMs } from '../lib/entries'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import { formatDuration, formatTime } from '../lib/time'
  import { PAIN, type Entry, type Tag } from '../lib/types'

  let {
    entry = $bindable(null),
    tagDefs = [],
    onedit,
  }: { entry: Entry | null; tagDefs?: Tag[]; onedit?: (e: Entry) => void } = $props()

  let open = $state(false)
  let level = $state(5)
  let current = $state.raw<Entry | null>(null)

  $effect(() => {
    if (entry) {
      dismissToast()
      current = entry
      level = entry.readings[PAIN] ?? 0
      open = true
    }
  })
  $effect(() => {
    if (!open) entry = null
  })

  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })
  const points = $derived(current ? [{ at: current.at, pain: current.readings[PAIN] ?? 0 }, ...(current.history ?? [])] : [])

  async function update() {
    if (!current) return
    const before = current
    await updateEpisodeIntensity(current.id, level)
    haptic(20)
    open = false
    showToast(t('episode.updated'), {
      label: t('log.undo'),
      run: () => void updateEpisodeIntensityUndo(before),
    })
  }
  async function updateEpisodeIntensityUndo(before: Entry) {
    const { db } = await import('../lib/db')
    await db.entries.update(before.id, { readings: before.readings, areas: before.areas, history: before.history, updatedAt: new Date().toISOString() })
  }
  async function end() {
    if (!current) return
    const id = current.id
    await endEpisode(id)
    haptic(20)
    open = false
    showToast(t('episode.ended'), { label: t('log.undo'), run: () => void reopenEpisode(id) })
  }
</script>

<Sheet bind:open title={t('episode.active')}>
  {#if current}
    <div class="card small">
      <div><EntrySummary areas={current.areas} tags={current.tags} {tagDefs} /></div>
      <div class="muted">{t('episode.since', { d: formatDuration(durationMs(current) ?? 0, units) })}</div>
      {#if points.length > 1}
        <div class="muted history">
          {#each points as p, i (i)}<span>{formatTime(p.at, locale())} <b>{p.pain}</b></span>{/each}
        </div>
      {/if}
    </div>
    <IntensitySlider bind:value={level} label={t('episode.levelNow')} />
    <div class="row">
      <button class="btn" onclick={end}>{t('episode.end')}</button>
      <button class="btn primary grow" onclick={update}>{t('episode.update')}</button>
    </div>
    <button class="btn link" onclick={() => { const e = current!; open = false; onedit?.(e) }}>{t('episode.edit')}</button>
  {/if}
</Sheet>

<style>
  .history { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .link { background: none; color: var(--accent); min-height: 40px; }
</style>
