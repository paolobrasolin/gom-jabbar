<script lang="ts">
  import Sheet from './Sheet.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import { t, tl, locale } from '../i18n/index.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { endEpisode, reopenEpisode, logUpdate, loadEpisode, deleteEntry, latest, durationMs, isActive, type Episode } from '../lib/entries'
  import { entryHeadline, headline, symptomName, layerLevel, regionText } from '../lib/summary'
  import { maxReadings, showsCategory } from '../lib/layers'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import { formatDuration, formatTime, formatDay } from '../lib/time'
  import { intensityColor, intensityInk } from '../lib/color'
  import { PAIN, type Entry, type Symptom, type Tag, type TagGroup } from '../lib/types'
  import { firstEnabled } from '../lib/vocabulary'

  /** `entry` is the head (§5.5); the sheet loads its updates and works from the latest reading. */
  let {
    entry = $bindable(null),
    tagDefs = [],
    symptoms = [],
    onedit,
  }: { entry: Entry | null; tagDefs?: Tag[]; symptoms?: Symptom[]; onedit?: (e: Entry) => void } = $props()

  let open = $state(false)
  /** One record per layer: the level of every symptom it tracks (the body's headline when it shows the body, the others when set above 0). */
  let levels = $state<Record<string, number>[]>([])
  /** Each layer's tags as edited in the sheet; saved with Aggiorna and Termina. */
  let picked = $state<string[][]>([])
  /** The layer the sliders and the chips edit (§5.5). */
  let cur = $state(0)
  let ep = $state.raw<Episode | null>(null)
  /** A note for this reading. */
  let note = $state('')

  $effect(() => {
    if (entry) {
      dismissToast()
      const head = entry
      void loadEpisode(head.id).then((loaded) => {
        if (!loaded || entry !== head) return
        ep = loaded
        const from = latest(loaded)
        const lead = firstEnabled(symptoms, 'body')?.id
        levels = from.layers.map((l) => {
          const body = showsCategory(l, 'body')
          const lv = Object.fromEntries(Object.entries(l.readings).filter(([id, v]) => (id === lead && body) || v > 0))
          // Only what this episode has read: no slider, and no reading, for a symptom it never had.
          if (lead && body && !(lead in lv) && !Object.keys(l.readings).length) lv[lead] = 0
          return lv
        })
        // Nothing pressed: a chip means "this, now", never "still".
        picked = from.layers.map(() => [])
        note = ''
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
  const tagName = (id: string) => {
    const d = tagDefs.find((x) => x.id === id)
    return d ? tl(d.label) : id
  }
  const groupOf = (id: string) => tagDefs.find((x) => x.id === id)?.group
  /** Always named, pain included, so a switch between symptoms shows. */
  const named = (id: string) => {
    const d = symptoms.find((x) => x.id === id)
    return (d ? tl(d.label) : id).toLowerCase()
  }
  /** The episode's context: its start's context tags, about the episode as a whole. */
  const context = $derived(ep ? [...new Set(ep.head.layers.flatMap((l) => l.tags))].filter((id) => groupOf(id) === 'context') : [])
  /** A chain over more than one day says the day on each reading ("ieri 21:06"); within a day the time is enough. */
  const manyDays = $derived(!!ep && new Set([ep.head, ...ep.updates].map((e) => new Date(e.at).toDateString())).size > 1)
  const when = (iso: string) =>
    manyDays ? `${formatDay(iso, locale(), { today: t('diary.today'), yesterday: t('diary.yesterday') })} ${formatTime(iso, locale())}` : formatTime(iso, locale())
  /**
   * Every reading, each an entry edited from its own line (§5.5): its highest symptom, named; its places, so an edit
   * shows where it was made; what was done then; its note.
   */
  const points = $derived(
    (ep ? [ep.head, ...ep.updates] : []).map((e) => {
      const h = headline(maxReadings(e.layers.map((l) => l.readings)))
      const where = e.layers.filter((l) => l.regions.length).map((l) => regionText(l.regions, t))
      const done = [...new Set(e.layers.flatMap((l) => l.tags))].filter((id) => groupOf(id) !== 'context').map(tagName)
      return { entry: e, value: h.value, name: named(h.id), where, done, note: e.note }
    }),
  )
  /** Sliders of the current layer in vocabulary order; a symptom missing from the vocabulary still gets one, named by its id. */
  const tracked = $derived.by(() => {
    const ids = Object.keys(levels[cur] ?? {})
    const def = (id: string) => symptoms.find((s) => s.id === id)
    const order = (id: string) => def(id)?.order ?? 1e9
    const name = (id: string) => {
      const d = def(id)
      return d ? tl(d.label) : id.charAt(0).toUpperCase() + id.slice(1)
    }
    return ids.sort((a, b) => order(a) - order(b)).map((id) => ({ id, label: name(id) }))
  })
  /** Each layer as it stands in the sheet, for the chips: its regions, its edited level. */
  const edited = $derived((now?.layers ?? []).map((l, i) => ({ ...l, readings: { ...l.readings, ...levels[i] }, tags: picked[i] ?? l.tags })))
  /** Whether the sliders or the chips moved since the latest reading: Termina then records one more reading first. */
  const changed = $derived(!!now && (!!note.trim() || picked.some((p) => p.length) || now.layers.some((l, i) => Object.entries(levels[i] ?? {}).some(([id, v]) => (l.readings[id] ?? 0) !== v))))

  /** A save in flight: the second tap of a double tap does nothing. */
  let busy = false
  /** Aggiorna logs a reading on the episode (§5.5); the toast takes it back. */
  async function update() {
    if (!ep || busy) return
    busy = true
    const added = await logUpdate(ep.head.id, levels.map((l) => ({ ...l })), undefined, picked.map((p) => [...p]), note).finally(() => (busy = false))
    haptic(20)
    open = false
    if (added) showToast(t('episode.updated'), { label: t('log.undo'), run: () => void deleteEntry(added.id) })
  }
  async function end() {
    if (!ep || busy) return
    busy = true
    const id = ep.head.id
    let added
    try {
      added = changed ? await logUpdate(id, levels.map((l) => ({ ...l })), undefined, picked.map((p) => [...p]), note) : undefined
      await endEpisode(id)
    } finally {
      busy = false
    }
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
      <div class="head">
        <div class="grow"><EntrySummary lead={symptomName(hl.id, symptoms, tl)} layers={now.layers} tagDefs={[]} /></div>
        <!-- Only while the start is what the card shows: with several readings each line opens its own. -->
        {#if points.length <= 1}<button class="edit" onclick={() => edit(ep!.head)}>{t('episode.editShort')}</button>{/if}
      </div>
      <div class="muted">{active ? t('episode.since', { d: formatDuration(durationMs(ep.head) ?? 0, units) }) : formatDuration(durationMs(ep.head) ?? 0, units)}{#if context.length}{' · '}{context.map(tagName).join(', ')}{/if}</div>
      {#if points.length > 1}
      <ol class="history" aria-label={t('episode.readings')}>
        {#each points as p (p.entry.id)}
          <li>
            <button class="point" onclick={() => edit(p.entry)}>
              <span class="time">{when(p.entry.at)}</span>
              <span class="pill" style="--c: {intensityColor(p.value)}; --ink-on: {intensityInk(p.value)}">{p.value}</span>
              <span class="what">{[p.name, ...p.where, ...(p.done.length ? [p.done.join(', ')] : [])].join(' · ')}{#if p.note}{' · '}<i>{p.note}</i>{/if}</span>
            </button>
          </li>
        {/each}
      </ol>
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
      {#each tracked as s (s.id)}
        <IntensitySlider label={s.label} value={levels[cur][s.id]} onchange={(v) => (levels[cur][s.id] = v)} />
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
      <textarea class="note" rows="1" placeholder={t('log.notePlaceholder')} bind:value={note} aria-label={t('log.note')}></textarea>
      <div class="row actions">
        <button class="btn" onclick={end}>{t('episode.end')}</button>
        <button class="btn primary grow" onclick={update}>{t('episode.update')}</button>
      </div>
    {/if}
  {/if}
</Sheet>

<style>
  .head { display: flex; align-items: flex-start; gap: 8px; }
  .edit { background: none; min-height: 44px; padding: 0 8px; font-size: 15px; font-weight: 600; color: var(--accent); border-radius: 8px; margin: -10px -8px 0 0; }
  .history { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-variant-numeric: tabular-nums; }
  .point { display: flex; align-items: center; gap: 10px; width: 100%; background: none; padding: 6px 4px; min-height: 44px; color: var(--ink); border-radius: 8px; text-align: left; }
  .time { color: var(--ink-2); min-width: 44px; }
  .pill { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; border-radius: 8px; background: var(--c); color: var(--ink-on); font-weight: 700; font-size: 14px; flex: none; }
  .what { min-width: 0; }
  .note { width: 100%; field-sizing: content; min-height: var(--tap); max-height: 30dvh; resize: none; }
  .group-title { margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
  .now { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; margin-bottom: -6px; }
  .actions { flex-wrap: wrap; }
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
