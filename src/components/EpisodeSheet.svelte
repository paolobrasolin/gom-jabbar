<script lang="ts">
  import Sheet from './Sheet.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import { t, tl, locale } from '../i18n/index.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { endEpisode, reopenEpisode, updateEpisode, updateEntry, durationMs } from '../lib/entries'
  import { entryHeadline, headline, symptomName, layerLevel } from '../lib/summary'
  import { maxReadings, showsCategory } from '../lib/layers'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import { formatDuration, formatTime } from '../lib/time'
  import { intensityColor, intensityInk } from '../lib/color'
  import { PAIN, type Entry, type Symptom, type Tag, type TagGroup } from '../lib/types'

  let {
    entry = $bindable(null),
    tagDefs = [],
    symptoms = [],
    onedit,
  }: { entry: Entry | null; tagDefs?: Tag[]; symptoms?: Symptom[]; onedit?: (e: Entry) => void } = $props()

  let open = $state(false)
  /** One record per layer: the level of every symptom it tracks (pain when it shows the body, the others when set above 0). */
  let levels = $state<Record<string, number>[]>([])
  /** Each layer's tags as edited in the sheet; saved with Aggiorna and Termina. */
  let picked = $state<string[][]>([])
  /** The layer the sliders and the chips edit (§5.5). */
  let cur = $state(0)
  let current = $state.raw<Entry | null>(null)

  $effect(() => {
    if (entry) {
      dismissToast()
      current = entry
      levels = entry.layers.map((l) => {
        const lv = Object.fromEntries(Object.entries(l.readings).filter(([id, v]) => (id === PAIN && showsCategory(l, 'body')) || v > 0))
        if (!(PAIN in lv) && showsCategory(l, 'body')) lv[PAIN] = 0
        return lv
      })
      picked = entry.layers.map((l) => [...l.tags])
      cur = 0
      open = true
    }
  })
  $effect(() => {
    if (!open) entry = null
  })

  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })
  const hl = $derived(current ? entryHeadline(current) : { id: PAIN, value: 0 })
  /** Remedies happen in response to pain, so they are offered here; context tags stay in the edit sheet. */
  const remedyGroups: TagGroup[] = ['intervention', 'medication']
  const remedies = $derived(remedyGroups.map((g) => ({ g, items: tagDefs.filter((x) => x.enabled && x.group === g) })).filter((x) => x.items.length))
  function toggleTag(id: string) {
    picked[cur] = picked[cur].includes(id) ? picked[cur].filter((x) => x !== id) : [...picked[cur], id]
  }
  const points = $derived((current?.history ?? []).map((h) => ({ at: h.at, value: maxReadings(h.layers)[hl.id] })).filter((p) => typeof p.value === 'number'))
  /** Sliders of the current layer in vocabulary order, pain first; a symptom missing from the vocabulary still gets one. */
  const tracked = $derived.by(() => {
    const ids = Object.keys(levels[cur] ?? {})
    const order = (id: string) => (id === PAIN ? -1 : (symptoms.find((s) => s.id === id)?.order ?? 1e9))
    return ids.sort((a, b) => order(a) - order(b)).map((id) => ({ id, label: id === PAIN ? tl(symptoms.find((s) => s.id === PAIN)?.label ?? { it: 'Dolore', en: 'Pain' }) : symptomName(id, symptoms, tl) }))
  })
  /** Each layer as it stands in the sheet, for the chips: its regions, its edited level. */
  const edited = $derived((current?.layers ?? []).map((l, i) => ({ ...l, readings: { ...l.readings, ...levels[i] }, tags: picked[i] ?? l.tags })))

  async function update() {
    if (!current) return
    const before = current
    await updateEpisode(current.id, levels.map((l) => ({ ...l })), undefined, picked.map((p) => [...p]))
    haptic(20)
    open = false
    showToast(t('episode.updated'), {
      label: t('log.undo'),
      run: () => void updateEpisodeUndo(before),
    })
  }
  async function updateEpisodeUndo(before: Entry) {
    const { db } = await import('../lib/db')
    await db.entries.update(before.id, { layers: before.layers, history: before.history, updatedAt: new Date().toISOString() })
  }
  async function end() {
    if (!current) return
    const before = current
    await endEpisode(before.id, undefined, picked.map((p) => [...p]))
    haptic(20)
    open = false
    showToast(t('episode.ended'), { label: t('log.undo'), run: () => void reopenEpisode(before.id).then(() => updateEntry(before.id, { layers: before.layers })) })
  }
</script>

<Sheet bind:open title={t('episode.active')}>
  {#if current}
    <div class="card small">
      <div><EntrySummary lead={symptomName(hl.id, symptoms, tl)} layers={current.layers} {tagDefs} /></div>
      <div class="muted">{t('episode.since', { d: formatDuration(durationMs(current) ?? 0, units) })}</div>
      {#if points.length > 1}
        <div class="muted history">
          {#each points as p, i (i)}<span>{formatTime(p.at, locale())} <b>{p.value}</b></span>{/each}
        </div>
      {/if}
    </div>
    {#if edited.length > 1}
      <div class="chips layers">
        {#each edited as l, i (i)}
          {@const level = layerLevel(l)}
          <button class="chip small area" aria-pressed={i === cur} style="--c: {intensityColor(level)}; --ink-on: {intensityInk(level)}" onclick={() => (cur = i)}>
            <span class="dot">{level}</span>
            <EntrySummary lead={symptomName(headline(l.readings).id, symptoms, tl)} layers={[l]} {tagDefs} />
          </button>
        {/each}
      </div>
    {/if}
    <p class="small muted now">{t('episode.levelNow')}</p>
    {#each tracked as s, i (s.id)}
      <IntensitySlider compact={i > 0} label={s.id === PAIN ? s.label : s.label.charAt(0).toUpperCase() + s.label.slice(1)} value={levels[cur][s.id]} onchange={(v) => (levels[cur][s.id] = v)} />
    {/each}
    {#each remedies as { g, items } (g)}
      <div>
        <p class="small muted group-title">{t(`tag.group.${g}`)}</p>
        <div class="chips">
          {#each items as tag (tag.id)}
            <button class="chip small" aria-pressed={picked[cur]?.includes(tag.id)} onclick={() => toggleTag(tag.id)}>{tl(tag.label)}</button>
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
  .layers { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -12px; padding: 2px 12px; }
  .layers::-webkit-scrollbar { display: none; }
  .area { background: var(--surface-2); color: var(--ink); border-color: transparent; padding-left: 6px; }
  .area[aria-pressed='true'] { background: var(--surface-2); color: var(--ink); border-color: var(--ink); }
  .dot {
    display: inline-flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    background: var(--c); color: var(--ink-on); font-weight: 700; font-size: 13px;
  }
</style>
