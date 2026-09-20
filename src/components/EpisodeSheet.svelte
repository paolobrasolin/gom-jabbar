<script lang="ts">
  import Sheet from './Sheet.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import { t, tl, locale } from '../i18n/index.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { endEpisode, reopenEpisode, updateEpisode, updateEntry, durationMs } from '../lib/entries'
  import { headline, symptomName } from '../lib/summary'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import { formatDuration, formatTime } from '../lib/time'
  import { PAIN, type Entry, type Symptom, type Tag, type TagGroup } from '../lib/types'
  import { mindOnly } from '../lib/areas'

  let {
    entry = $bindable(null),
    tagDefs = [],
    symptoms = [],
    onedit,
  }: { entry: Entry | null; tagDefs?: Tag[]; symptoms?: Symptom[]; onedit?: (e: Entry) => void } = $props()

  let open = $state(false)
  /** One level per symptom the episode tracks: pain always (unless only the mind is selected), the others when set above 0. */
  let levels = $state<Record<string, number>>({})
  let current = $state.raw<Entry | null>(null)
  /** The entry's tags as edited in the sheet; saved with Aggiorna and Termina. */
  let picked = $state<string[]>([])

  $effect(() => {
    if (entry) {
      dismissToast()
      current = entry
      const mind = mindOnly(entry.areas)
      const lv = Object.fromEntries(Object.entries(entry.readings).filter(([id, v]) => (id === PAIN && !mind) || v > 0))
      if (!(PAIN in lv) && !mind) lv[PAIN] = 0
      levels = lv
      picked = [...entry.tags]
      open = true
    }
  })
  $effect(() => {
    if (!open) entry = null
  })

  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })
  const hl = $derived(current ? headline(current.readings) : { id: PAIN, value: 0 })
  /** Remedies happen in response to pain, so they are offered here; context tags stay in the edit sheet. */
  const remedyGroups: TagGroup[] = ['intervention', 'medication']
  const remedies = $derived(remedyGroups.map((g) => ({ g, items: tagDefs.filter((x) => x.enabled && x.group === g) })).filter((x) => x.items.length))
  function toggleTag(id: string) {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]
  }
  const points = $derived((current?.history ?? []).filter((h) => typeof h.readings[hl.id] === 'number'))
  /** Sliders in vocabulary order, pain first; a symptom missing from the vocabulary still gets one. */
  const tracked = $derived.by(() => {
    const ids = Object.keys(levels)
    const order = (id: string) => (id === PAIN ? -1 : (symptoms.find((s) => s.id === id)?.order ?? 1e9))
    return ids.sort((a, b) => order(a) - order(b)).map((id) => ({ id, label: id === PAIN ? tl(symptoms.find((s) => s.id === PAIN)?.label ?? { it: 'Dolore', en: 'Pain' }) : symptomName(id, symptoms, tl) }))
  })

  async function update() {
    if (!current) return
    const before = current
    await updateEpisode(current.id, { ...levels }, undefined, picked)
    haptic(20)
    open = false
    showToast(t('episode.updated'), {
      label: t('log.undo'),
      run: () => void updateEpisodeUndo(before),
    })
  }
  async function updateEpisodeUndo(before: Entry) {
    const { db } = await import('../lib/db')
    await db.entries.update(before.id, { readings: before.readings, areas: before.areas, history: before.history, tags: before.tags, updatedAt: new Date().toISOString() })
  }
  async function end() {
    if (!current) return
    const before = current
    await endEpisode(before.id, undefined, picked)
    haptic(20)
    open = false
    showToast(t('episode.ended'), { label: t('log.undo'), run: () => void reopenEpisode(before.id).then(() => updateEntry(before.id, { tags: before.tags })) })
  }
</script>

<Sheet bind:open title={t('episode.active')}>
  {#if current}
    <div class="card small">
      <div><EntrySummary lead={symptomName(hl.id, symptoms, tl)} areas={current.areas} tags={current.tags} {tagDefs} /></div>
      <div class="muted">{t('episode.since', { d: formatDuration(durationMs(current) ?? 0, units) })}</div>
      {#if points.length > 1}
        <div class="muted history">
          {#each points as p, i (i)}<span>{formatTime(p.at, locale())} <b>{p.readings[hl.id]}</b></span>{/each}
        </div>
      {/if}
    </div>
    <p class="small muted now">{t('episode.levelNow')}</p>
    {#each tracked as s, i (s.id)}
      <IntensitySlider compact={i > 0} label={s.id === PAIN ? s.label : s.label.charAt(0).toUpperCase() + s.label.slice(1)} value={levels[s.id]} onchange={(v) => (levels[s.id] = v)} />
    {/each}
    {#each remedies as { g, items } (g)}
      <div>
        <p class="small muted group-title">{t(`tag.group.${g}`)}</p>
        <div class="chips">
          {#each items as tag (tag.id)}
            <button class="chip small" aria-pressed={picked.includes(tag.id)} onclick={() => toggleTag(tag.id)}>{tl(tag.label)}</button>
          {/each}
        </div>
      </div>
    {/each}
    <div class="row">
      <button class="btn" onclick={end}>{t('episode.end')}</button>
      <button class="btn primary grow" onclick={update}>{t('episode.update')}</button>
    </div>
    <button class="btn link" onclick={() => { const e = current!; open = false; onedit?.(e) }}>{t('episode.edit')}</button>
  {/if}
</Sheet>

<style>
  .history { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .group-title { margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
  .now { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; margin-bottom: -6px; }
  .link { background: none; color: var(--accent); min-height: 40px; }
</style>
