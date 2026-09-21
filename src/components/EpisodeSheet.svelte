<script lang="ts">
  import Sheet from './Sheet.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import { t, tl, locale } from '../i18n/index.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { endEpisode, reopenEpisode, logUpdate, loadEpisode, deleteEntry, latest, durationMs, isActive, type Episode } from '../lib/entries'
  import { entryHeadline, headline, symptomName, layerLevel } from '../lib/summary'
  import { maxReadings, showsCategory } from '../lib/layers'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import { formatDuration, formatTime } from '../lib/time'
  import { intensityColor, intensityInk } from '../lib/color'
  import { PAIN, type Entry, type Symptom, type Tag, type TagGroup } from '../lib/types'

  /** `entry` is the head (§5.5); the sheet loads its updates and works from the latest reading. */
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
  let ep = $state.raw<Episode | null>(null)

  $effect(() => {
    if (entry) {
      dismissToast()
      const head = entry
      void loadEpisode(head.id).then((loaded) => {
        if (!loaded || entry !== head) return
        ep = loaded
        const from = latest(loaded)
        levels = from.layers.map((l) => {
          const lv = Object.fromEntries(Object.entries(l.readings).filter(([id, v]) => (id === PAIN && showsCategory(l, 'body')) || v > 0))
          if (!(PAIN in lv) && showsCategory(l, 'body')) lv[PAIN] = 0
          return lv
        })
        picked = from.layers.map((l) => [...l.tags])
        cur = 0
        open = true
      })
    }
  })
  $effect(() => {
    if (!open) entry = null
  })

  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })
  const now = $derived(ep ? latest(ep) : null)
  const active = $derived(!!ep && isActive(ep.head))
  const hl = $derived(now ? entryHeadline(now) : { id: PAIN, value: 0 })
  /** Remedies happen in response to pain, so they are offered here; context tags stay in the edit sheet. */
  const remedyGroups: TagGroup[] = ['intervention', 'medication']
  const remedies = $derived(remedyGroups.map((g) => ({ g, items: tagDefs.filter((x) => x.enabled && x.group === g) })).filter((x) => x.items.length))
  function toggleTag(id: string) {
    picked[cur] = picked[cur].includes(id) ? picked[cur].filter((x) => x !== id) : [...picked[cur], id]
  }
  /** Every reading of the episode with its headline level: the trail, each point editable. */
  const points = $derived(
    (ep ? [ep.head, ...ep.updates] : []).map((e) => ({ entry: e, value: maxReadings(e.layers.map((l) => l.readings))[hl.id] })).filter((p) => typeof p.value === 'number'),
  )
  /** Sliders of the current layer in vocabulary order, pain first; a symptom missing from the vocabulary still gets one. */
  const tracked = $derived.by(() => {
    const ids = Object.keys(levels[cur] ?? {})
    const order = (id: string) => (id === PAIN ? -1 : (symptoms.find((s) => s.id === id)?.order ?? 1e9))
    return ids.sort((a, b) => order(a) - order(b)).map((id) => ({ id, label: id === PAIN ? tl(symptoms.find((s) => s.id === PAIN)?.label ?? { it: 'Dolore', en: 'Pain' }) : symptomName(id, symptoms, tl) }))
  })
  /** Each layer as it stands in the sheet, for the chips: its regions, its edited level. */
  const edited = $derived((now?.layers ?? []).map((l, i) => ({ ...l, readings: { ...l.readings, ...levels[i] }, tags: picked[i] ?? l.tags })))
  /** Whether the sliders or the chips moved since the latest reading: Termina then records one more reading first. */
  const changed = $derived(!!now && now.layers.some((l, i) => JSON.stringify(picked[i] ?? l.tags) !== JSON.stringify(l.tags) || Object.entries(levels[i] ?? {}).some(([id, v]) => (l.readings[id] ?? 0) !== v)))

  /** Aggiorna logs a reading on the episode (§5.5); the toast takes it back. */
  async function update() {
    if (!ep) return
    const added = await logUpdate(ep.head.id, levels.map((l) => ({ ...l })), undefined, picked.map((p) => [...p]))
    haptic(20)
    open = false
    if (added) showToast(t('episode.updated'), { label: t('log.undo'), run: () => void deleteEntry(added.id) })
  }
  async function end() {
    if (!ep) return
    const id = ep.head.id
    const added = changed ? await logUpdate(id, levels.map((l) => ({ ...l })), undefined, picked.map((p) => [...p])) : undefined
    await endEpisode(id)
    haptic(20)
    open = false
    showToast(t('episode.ended'), {
      label: t('log.undo'),
      run: () => void reopenEpisode(id).then(() => (added ? deleteEntry(added.id) : undefined)),
    })
  }
  function edit(e: Entry) {
    open = false
    onedit?.(e)
  }
</script>

<Sheet bind:open title={t(active ? 'episode.active' : 'episode.ended')}>
  {#if ep && now}
    <div class="card small">
      <div><EntrySummary lead={symptomName(hl.id, symptoms, tl)} layers={now.layers} {tagDefs} /></div>
      <div class="muted">{active ? t('episode.since', { d: formatDuration(durationMs(ep.head) ?? 0, units) }) : formatDuration(durationMs(ep.head) ?? 0, units)}</div>
      {#if points.length > 1}
        <div class="history" aria-label={t('episode.readings')}>
          {#each points as p (p.entry.id)}<button class="point" onclick={() => edit(p.entry)}>{formatTime(p.entry.at, locale())} <b>{p.value}</b></button>{/each}
        </div>
      {/if}
    </div>
    {#if active}
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
    {/if}
    <button class="btn link" onclick={() => edit(ep!.head)}>{t('episode.edit')}</button>
  {/if}
</Sheet>

<style>
  .history { display: flex; flex-wrap: wrap; gap: 4px 8px; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .point { background: none; padding: 4px 4px; min-height: 32px; color: var(--ink-2); border-radius: 6px; }
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
