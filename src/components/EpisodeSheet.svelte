<script lang="ts">
  import Sheet from './Sheet.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import { t, tl, locale } from '../i18n/index.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { endEpisode, reopenEpisode, logUpdate, loadEpisode, deleteEntry, latest, shownReading, durationMs, isActive, isStale, type Episode } from '../lib/entries'
  import { entryHeadline, headline, symptomName, layerLevel, regionText, isRead } from '../lib/summary'
  import { maxReadings, showsCategory } from '../lib/layers'
  import { showToast, showRefusal, haptic, dismissToast } from '../lib/toast.svelte'
  import { failed } from '../lib/failure'
  import { formatDuration, formatTime, formatDay, dayKey, fromLocalInput, toLocalInput } from '../lib/time'
  import { intensityColor, intensityInk } from '../lib/color'
  import { type Entry, type Symptom, type Tag, type TagGroup } from '../lib/types'
  import { firstEnabled, leadSymptom } from '../lib/vocabulary'

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
  /** What each layer had read when the sheet opened: its sliders, fixed for the session, so one set from the fold stays put. */
  let read = $state<string[][]>([])
  /** The levels as the sheet opened: anything else is a change, a 0 chosen for a new symptom included. */
  let initial = ''
  /** The layer's other symptoms, unfolded (#111): closed each time the sheet opens. */
  let others = $state(false)

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
        read = levels.map((l) => Object.keys(l))
        initial = JSON.stringify(levels)
        others = false
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
  /** What the card leads with (§5.5): how it is now while it goes on, the worst it got once ended. */
  const shown = $derived(ep ? shownReading(ep) : null)
  const leadId = $derived(leadSymptom(symptoms))
  const hl = $derived(shown ? entryHeadline(shown, leadId) : headline({}, leadId))
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
   * A forgotten episode (#115): going on with no reading for a day. The sheet opens asking whether it still is, and offers
   * its end at the last reading, now, or at a time picked between the two. Aggiorna answers it too: a reading now.
   */
  const stale = $derived(!!ep && isStale(ep))
  /** The last reading's time in a sentence, "ieri 03:00": the day always, the reading being a day old or more. */
  const lastWhen = (iso: string) => `${formatDay(iso, locale(), { today: t('diary.today'), yesterday: t('diary.yesterday') }).toLowerCase()} ${formatTime(iso, locale())}`
  /** The picker's value, local time to the minute; it opens on the last reading. */
  let endPick = $state('')
  $effect(() => {
    if (stale && now) endPick = toLocalInput(now.at)
  })
  /** End a stale episode in the past: nothing is read at that time, so no reading is logged; undo reopens it. */
  async function endAt(at: string) {
    if (!ep || busy) return
    busy = true
    const id = ep.head.id
    try {
      await endEpisode(id, at)
    } catch (e) {
      return failed(e)
    } finally {
      busy = false
    }
    haptic(20)
    open = false
    showToast(t('episode.ended'), { label: t('log.undo'), run: () => void reopenEpisode(id).catch(failed) })
  }
  function endAtPicked() {
    const at = fromLocalInput(endPick)
    if (!now || !at) return
    // The picker works to the minute: the last reading's own minute counts as after it.
    if (at < toLocalMinute(now.at)) return showRefusal(t('episode.endBeforeLast'))
    if (Date.parse(at) > Date.now()) return showRefusal(t('episode.endInFuture'))
    void endAt(at < now.at ? now.at : at)
  }
  const toLocalMinute = (iso: string) => fromLocalInput(toLocalInput(iso))!

  /** When an ended episode ended: "finito alle 12:00" today, "finito ieri alle 21:06" on another day. */
  function endedText(iso: string): string {
    const time = formatTime(iso, locale())
    if (dayKey(iso) === dayKey(new Date().toISOString())) return t('episode.endedAt', { t: time })
    return t('episode.endedOn', { d: formatDay(iso, locale(), { today: t('diary.today'), yesterday: t('diary.yesterday') }).toLowerCase(), t: time })
  }
  /**
   * Every reading, each an entry edited from its own line (§5.5): its highest symptom, named; its places, so an edit
   * shows where it was made; what was done then; its note.
   */
  const points = $derived(
    (ep ? [ep.head, ...ep.updates] : []).map((e) => {
      const h = headline(maxReadings(e.layers.map((l) => l.readings)), leadId)
      const where = e.layers.filter((l) => l.regions.length).map((l) => regionText(l.regions, t))
      const done = [...new Set(e.layers.flatMap((l) => l.tags))].filter((id) => groupOf(id) !== 'context').map(tagName)
      return { entry: e, value: h.value, name: named(h.id), where, done, note: e.note }
    }),
  )
  /** Sliders of the current layer in vocabulary order; a symptom missing from the vocabulary still gets one, named by its id. */
  const tracked = $derived.by(() => {
    const ids = [...(read[cur] ?? [])]
    const def = (id: string) => symptoms.find((s) => s.id === id)
    const order = (id: string) => def(id)?.order ?? 1e9
    const name = (id: string) => {
      const d = def(id)
      return d ? tl(d.label) : id.charAt(0).toUpperCase() + id.slice(1)
    }
    return ids.sort((a, b) => order(a) - order(b)).map((id) => ({ id, label: name(id) }))
  })
  /**
   * A symptom the episode did not start with (#111): the layer's other enabled symptoms, in vocabulary order, behind a fold
   * under the ones read. Blank, they record nothing; set, Aggiorna or Termina records them like any other.
   */
  const untracked = $derived.by(() => {
    // Read only inside the sheet's body, where the latest reading and its layer exist.
    const layer = now!.layers[cur]
    const have = new Set(read[cur] ?? [])
    return [...symptoms].filter((s) => s.enabled && !have.has(s.id) && showsCategory(layer, s.category)).sort((a, b) => a.order - b.order).map((s) => ({ id: s.id, label: tl(s.label) }))
  })
  /** Each layer as it stands in the sheet, for the chips: its regions, its edited level. */
  const edited = $derived((now?.layers ?? []).map((l, i) => ({ ...l, readings: { ...l.readings, ...levels[i] }, tags: picked[i] ?? l.tags })))
  /** Whether the sliders or the chips moved since the latest reading: Termina then records one more reading first. */
  const changed = $derived(!!now && (!!note.trim() || picked.some((p) => p.length) || JSON.stringify(levels) !== initial))

  /** A save in flight: the second tap of a double tap does nothing. */
  let busy = false
  /** Aggiorna logs a reading on the episode (§5.5); the toast takes it back. */
  async function update() {
    if (!ep || busy) return
    busy = true
    let added
    try {
      added = await logUpdate(ep.head.id, levels.map((l) => ({ ...l })), undefined, picked.map((p) => [...p]), note)
    } catch (e) {
      return failed(e)
    } finally {
      busy = false
    }
    haptic(20)
    open = false
    if (added) showToast(t('episode.updated'), { label: t('log.undo'), run: () => void deleteEntry(added.id).catch(failed) })
  }
  async function end() {
    if (!ep || busy) return
    busy = true
    const id = ep.head.id
    let added
    try {
      added = changed ? await logUpdate(id, levels.map((l) => ({ ...l })), undefined, picked.map((p) => [...p]), note) : undefined
      await endEpisode(id)
    } catch (e) {
      return failed(e)
    } finally {
      busy = false
    }
    haptic(20)
    open = false
    showToast(t('episode.ended'), {
      label: t('log.undo'),
      run: () => void reopenEpisode(id).then(() => (added ? deleteEntry(added.id) : undefined)).catch(failed),
    })
  }
  function edit(e: Entry) {
    open = false
    onedit?.(e)
  }
</script>

<!-- An ended episode is just "Episodio": "Episodio terminato" is what the toast says when one ends. -->
<Sheet bind:open title={t(active ? 'episode.active' : 'episode.title')}>
  {#if ep && now && stale}
    <div class="card small stale" role="group" aria-label={t('episode.stale')}>
      <p class="ask">{t('episode.stale')}</p>
      <p class="small muted">{t('episode.staleSince', { d: formatDuration(Date.now() - Date.parse(now.at), units) })}</p>
      <div class="chips">
        <button class="chip small" onclick={() => endAt(now!.at)}>{t('episode.endedAtLast', { when: lastWhen(now.at) })}</button>
        <button class="chip small" onclick={() => endAt(new Date().toISOString())}>{t('episode.endedNow')}</button>
      </div>
      <div class="pick">
        <input type="datetime-local" aria-label={t('episode.endedWhen')} bind:value={endPick} min={toLocalInput(now.at)} max={toLocalInput(new Date().toISOString())} />
        <button class="chip small outline" onclick={endAtPicked}>{t('episode.endAtPicked')}</button>
      </div>
    </div>
  {/if}
  {#if ep && now}
    <div class="card small">
      <div class="head">
        <span class="pill" style="--c: {intensityColor(hl.value)}; --ink-on: {intensityInk(hl.value)}">{shown && isRead(shown.layers) ? hl.value : '–'}</span>
        <div class="grow"><EntrySummary lead={shown && isRead(shown.layers) ? symptomName(hl.id, symptoms, tl) : ''} layers={(shown ?? now).layers} tagDefs={[]} /></div>
        <!-- Only while the start is what the card shows: with several readings each line opens its own. -->
        {#if points.length <= 1}<button class="edit" onclick={() => edit(ep!.head)}>{t('episode.editShort')}</button>{/if}
      </div>
      <div class="muted">{active ? t('episode.since', { d: formatDuration(durationMs(ep.head) ?? 0, units) }) : `${formatDuration(durationMs(ep.head) ?? 0, units)} · ${endedText(ep.head.endedAt!)}`}{#if context.length}{' · '}{context.map(tagName).join(', ')}{/if}</div>
      {#if points.length > 1}
      <ol class="history" aria-label={t('episode.readings')}>
        {#each points as p (p.entry.id)}
          <li>
            <button class="point" aria-describedby={p.note ? `reading-note-${p.entry.id}` : undefined} onclick={() => edit(p.entry)}>
              <span class="time">{when(p.entry.at)}</span>
              <span class="pill" style="--c: {intensityColor(p.value)}; --ink-on: {intensityInk(p.value)}">{p.value}</span>
              <span class="what">{[p.name, ...p.where, ...(p.done.length ? [p.done.join(', ')] : [])].join(' · ')}{#if p.note}<span aria-hidden="true">{' · '}<i id="reading-note-{p.entry.id}">{p.note}</i></span>{/if}</span>
              <!-- The line opens its reading's form (#115): read as plain text, nothing said it could be tapped. -->
              <svg class="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
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
              <EntrySummary lead={symptomName(headline(l.readings, leadId).id, symptoms, tl)} layers={[l]} {tagDefs} />
            </button>
          {/each}
        </div>
      {/if}
      <p class="small muted now">{t('episode.levelNow')}</p>
      {#each tracked as s (s.id)}
        <IntensitySlider label={s.label} value={levels[cur][s.id]} onchange={(v) => (levels[cur][s.id] = v)} />
      {/each}
      {#if untracked.length}
        <!-- The chevron of "Tutti i tag" (§6.1): the common case stays short, a late symptom is a tap away (#111). -->
        <div class="fold">
          <button class="chip small expand" aria-expanded={others} aria-label={t('episode.otherSymptoms')} onclick={() => (others = !others)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              {#if others}<path d="M6 15l6-6 6 6" />{:else}<path d="M6 9l6 6 6-6" />{/if}
            </svg>
          </button>
          <span class="fold-label" aria-hidden="true">{t('episode.otherSymptoms')}</span>
        </div>
        {#if others}
          {#each untracked as s (s.id)}
            <IntensitySlider label={s.label} value={levels[cur][s.id] ?? null} onchange={(v) => (levels[cur][s.id] = v)} />
          {/each}
        {/if}
      {/if}
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
  .fold { display: flex; align-items: center; gap: 10px; }
  .fold .expand { width: 44px; padding: 0; justify-content: center; color: var(--ink-2); }
  .fold-label { font-size: 15px; font-weight: 600; color: var(--ink-2); }
  /* The forgotten episode's question (#115), first in the sheet. */
  .stale { display: flex; flex-direction: column; gap: 8px; border: 1.5px solid var(--accent); }
  .ask { margin: 0; font-weight: 700; }
  .pick { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .pick input { min-height: 44px; flex: 1; min-width: 0; font: inherit; padding: 0 8px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); color: var(--ink); }
  .edit { background: none; min-height: 44px; padding: 0 8px; font-size: 15px; font-weight: 600; color: var(--accent); border-radius: 8px; margin: -10px -8px 0 0; }
  .history { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-variant-numeric: tabular-nums; }
  .go { width: 16px; height: 16px; flex: none; margin-left: auto; color: var(--ink-2); }
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
