<script lang="ts">
  import BodyMap from './BodyMap.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import { regionText } from '../lib/summary'
  import { t, tl, locale } from '../i18n/index.svelte'
  import { prefs, savePrefs } from '../lib/prefs.svelte'
  import { intensityColor, intensityInk } from '../lib/color'
  import { PAIN, type Symptom, type Tag, type TagGroup } from '../lib/types'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { frequentTags } from '../lib/vocab'
  import { LEG_IDS, ARM_IDS, MIND, limbOf, mirrorId } from '../lib/regions'
  import { isFull, isMindArea, bodyAreas, hasMind, tapRegion, tapSet, toggleMind, setMindLevel, toggleFull, addArea, selectArea, setIntensity, overallPain } from '../lib/areas'
  import { isMindSymptom, mindMax } from '../lib/vocabulary'
  import { toLocalInput, fromLocalInput, thisMorning, lastNight, hoursAgo, formatTime, formatDay } from '../lib/time'
  import type { EntryDraft } from '../lib/draft'
  import { haptic } from '../lib/toast.svelte'

  let { draft = $bindable(), symptoms = [], tags = [] }: { draft: EntryDraft; symptoms?: Symptom[]; tags?: Tag[] } = $props()

  let showPicker = $state(false)

  // The strip: every enabled tag, the most used first (§6.1 item 8). Expanded, the same tags by group take its place.
  const entries = live(() => null, () => db.entries.toArray(), [])
  const suggestions = $derived(frequentTags(entries.value, tags))
  let allTags = $state(false)
  // A new draft (save, clear, another entry to edit) folds the full list away again.
  $effect(() => {
    void draft
    allTags = false
  })
  const groups: TagGroup[] = ['intervention', 'context', 'medication']
  const tagsByGroup = $derived(groups.map((g) => ({ g, items: tags.filter((x) => x.enabled && x.group === g) })).filter((x) => x.items.length))
  const bodySymptoms = $derived(symptoms.filter((s) => s.enabled && s.id !== PAIN && !isMindSymptom(s)))
  const mindSymptoms = $derived(symptoms.filter((s) => s.enabled && isMindSymptom(s)))

  const curArea = $derived(draft.areas[draft.cur])
  /** Which sliders show (§6.1) follows what is selected: body areas → pain and the body symptoms, the mind → the mind symptoms, both or nothing → both. */
  const showBody = $derived(bodyAreas(draft.areas).length > 0 || !hasMind(draft.areas))
  const showMind = $derived(hasMind(draft.areas) || bodyAreas(draft.areas).length === 0)
  /** The body area the pain slider edits: the current one, or the last one while the mind chip is current. -1 without body areas. */
  const curBody = $derived.by(() => {
    if (curArea && !isMindArea(curArea)) return draft.cur
    for (let i = draft.areas.length - 1; i >= 0; i--) if (!isMindArea(draft.areas[i])) return i
    return -1
  })
  /** Brush = the level the pain slider shows: that body area's, else the entry-level pain (the free value). */
  const brush = $derived(draft.areas[curBody]?.intensity ?? draft.readings[PAIN] ?? 0)
  const full = $derived(isFull(draft.areas))
  const curRegions = $derived(draft.areas[draft.cur]?.regions ?? [])
  const legsOn = $derived(!full && LEG_IDS.every((id) => curRegions.includes(id)))
  const armsOn = $derived(!full && ARM_IDS.every((id) => curRegions.includes(id)))
  const painLabel = $derived.by(() => {
    const base = tl(symptoms.find((s) => s.id === PAIN)?.label ?? { it: 'Dolore', en: 'Pain' })
    const cur = draft.areas[curBody]
    return draft.areas.length > 1 && cur?.regions.length ? `${base} · ${regionText(cur.regions, t)}` : base
  })

  type TimeChoice = { key: string; label: string; iso: string | null }
  const timeChoices = $derived.by((): TimeChoice[] => {
    const now = new Date()
    return [
      { key: 'now', label: t('time.now'), iso: null },
      { key: 'h1', label: t('time.hoursAgo', { n: 1 }), iso: hoursAgo(1, now).toISOString() },
      { key: 'h3', label: t('time.hoursAgo', { n: 3 }), iso: hoursAgo(3, now).toISOString() },
      { key: 'morning', label: t('time.thisMorning'), iso: thisMorning(now).toISOString() },
      { key: 'night', label: t('time.lastNight'), iso: lastNight(now).toISOString() },
    ]
  })
  const activeTimeKey = $derived.by(() => {
    if (draft.at === null) return 'now'
    const m = timeChoices.find((c) => c.iso && Math.abs(Date.parse(c.iso) - Date.parse(draft.at!)) < 60_000)
    return m?.key ?? 'custom'
  })
  const customLabel = $derived(
    draft.at ? `${formatDay(draft.at, locale(), { today: t('diary.today'), yesterday: t('diary.yesterday') })} ${formatTime(draft.at, locale())}` : '',
  )

  function apply(next: { areas: EntryDraft['areas']; cur: number }) {
    draft.areas = next.areas
    draft.cur = next.cur
    // The pain slider keeps its value while hidden behind the mind; the entry gets 0 at save (§5.4).
    if (bodyAreas(draft.areas).length) draft.readings = { ...draft.readings, [PAIN]: overallPain(draft.areas, brush) }
  }
  function onRegion(id: string) {
    const state = { areas: draft.areas, cur: draft.cur }
    apply(id === MIND ? toggleMind(state, mindMax(draft.readings, symptoms)) : tapRegion(state, id, prefs.mirror, brush))
    haptic(6)
  }
  function onSet(ids: string[]) {
    apply(tapSet({ areas: draft.areas, cur: draft.cur }, ids, brush))
  }
  function onLimb(id: string) {
    let ids = limbOf(id)
    if (prefs.mirror) ids = [...new Set(ids.flatMap((x) => [x, mirrorId(x) ?? x]))]
    onSet(ids)
    haptic(25)
  }
  function onFull() {
    apply(toggleFull({ areas: draft.areas, cur: draft.cur }, brush))
  }
  function onSlider(v: number) {
    if (curBody >= 0) apply({ areas: setIntensity({ areas: draft.areas, cur: curBody }, v).areas, cur: draft.cur })
    else draft.readings = { ...draft.readings, [PAIN]: v }
  }
  function setMirror(v: boolean) {
    prefs.mirror = v
    savePrefs()
  }
  function toggleTag(id: string) {
    draft.tags = draft.tags.includes(id) ? draft.tags.filter((x) => x !== id) : [...draft.tags, id]
  }
  function setReading(id: string, v: number) {
    draft.readings = { ...draft.readings, [id]: v }
    if (hasMind(draft.areas)) draft.areas = setMindLevel(draft.areas, mindMax(draft.readings, symptoms))
  }
</script>

<div class="form">
  <div class="chips tools">
    <button class="chip small" aria-pressed={prefs.mirror} onclick={() => setMirror(!prefs.mirror)}>{t('log.mirror')}</button>
    <button class="chip small" aria-pressed={full} onclick={onFull}>{t('log.fullBody')}</button>
    <button class="chip small" aria-pressed={legsOn} disabled={full} onclick={() => onSet(LEG_IDS)}>{t('log.legs')}</button>
    <button class="chip small" aria-pressed={armsOn} disabled={full} onclick={() => onSet(ARM_IDS)}>{t('log.arms')}</button>
  </div>

  <div class="map">
    <BodyMap areas={draft.areas} cur={draft.cur} onToggle={onRegion} onLongPress={onLimb} labels={{ front: t('log.front'), back: t('log.back'), mind: t('log.mind') }} />
  </div>

  <div class="chips areas">
    {#if draft.areas.length === 0}
      <span class="small muted placeholder">{t('log.noArea')}</span>
    {:else}
      {#each draft.areas as a, i (i)}
        <button
          class="chip small area"
          class:current={i === draft.cur}
          aria-pressed={i === draft.cur}
          style="--c: {intensityColor(a.intensity)}; --ink-on: {intensityInk(a.intensity)}"
          onclick={() => apply(selectArea({ areas: draft.areas, cur: draft.cur }, i))}>
          <span class="dot">{a.intensity}</span>
          {#if a.regions.length}<EntrySummary areas={[a]} />{:else}<span class="muted">…</span>{/if}
        </button>
      {/each}
      {#if !full && draft.areas[draft.cur]?.regions.length}
        <button class="chip small outline" onclick={() => apply(addArea({ areas: draft.areas, cur: draft.cur }, brush))}>+ {t('log.addArea')}</button>
      {/if}
    {/if}
  </div>

  <div class="chips time">
    <button class="chip small ongoing" aria-pressed={draft.ongoing} onclick={() => (draft.ongoing = !draft.ongoing)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      {t('log.ongoing')}
    </button>
    {#each timeChoices as c (c.key)}
      <button
        class="chip small"
        aria-pressed={activeTimeKey === c.key}
        onclick={() => {
          draft.at = c.iso
          showPicker = false
        }}>{c.label}</button>
    {/each}
    <button class="chip small" aria-pressed={activeTimeKey === 'custom'} onclick={() => (showPicker = !showPicker)}>
      {activeTimeKey === 'custom' ? customLabel : t('time.pick')}
    </button>
  </div>
  {#if showPicker}
    <input
      type="datetime-local"
      value={toLocalInput(draft.at ?? new Date().toISOString())}
      onchange={(e) => (draft.at = fromLocalInput((e.target as HTMLInputElement).value))} />
  {/if}

  {#snippet expander()}
    <button class="chip small expand" aria-expanded={allTags} aria-label={t('log.allTags')} onclick={() => (allTags = !allTags)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {#if allTags}<path d="M6 15l6-6 6 6" />{:else}<path d="M6 9l6 6 6-6" />{/if}
      </svg>
    </button>
  {/snippet}

  {#if !allTags}
    <div class="chips suggest" aria-label={t('log.suggestions')}>
      {@render expander()}
      {#each suggestions as tag (tag.id)}
        <button class="chip small" aria-pressed={draft.tags.includes(tag.id)} onclick={() => toggleTag(tag.id)}>{tl(tag.label)}</button>
      {/each}
    </div>
  {:else}
    <div class="expanded">
      <!-- The chevron keeps its slot; a rail drops from it along everything it folds. -->
      <div class="rail">
        {@render expander()}
        <div class="line"></div>
      </div>
      <div class="groups">
        {#each tagsByGroup as { g, items } (g)}
          <div>
            <p class="group-title">{t(`tag.group.${g}`)}</p>
            <div class="chips">
              {#each items as tag (tag.id)}
                <button class="chip small" aria-pressed={draft.tags.includes(tag.id)} onclick={() => toggleTag(tag.id)}>{tl(tag.label)}</button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if showBody}
    <IntensitySlider value={brush} label={painLabel} onchange={onSlider} />
    {#each bodySymptoms as s (s.id)}
      <IntensitySlider compact label={tl(s.label)} value={draft.readings[s.id] ?? 0} onchange={(v) => setReading(s.id, v)} />
    {/each}
  {/if}
  {#if showMind}
    {#each mindSymptoms as s (s.id)}
      <IntensitySlider compact label={tl(s.label)} value={draft.readings[s.id] ?? 0} onchange={(v) => setReading(s.id, v)} />
    {/each}
  {/if}

  <textarea class="note" rows="1" placeholder={t('log.notePlaceholder')} bind:value={draft.note} aria-label={t('log.note')}></textarea>
</div>

<style>
  .form { display: flex; flex-direction: column; gap: 12px; min-width: 0; flex: 1; }
  .form > * { min-width: 0; }
  .areas { min-height: 40px; align-items: center; }
  .placeholder { padding-left: 4px; }
  .ongoing { border-color: var(--border); }
  .ongoing[aria-pressed='true'] { border-color: transparent; }
  .tools, .time, .areas, .suggest { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -12px; padding: 2px 12px; }
  .tools::-webkit-scrollbar, .time::-webkit-scrollbar, .areas::-webkit-scrollbar, .suggest::-webkit-scrollbar { display: none; }
  .map { flex: 1 1 var(--map-h, 320px); min-height: var(--map-min, 320px); max-height: var(--map-max, 640px); }
  .chip:disabled { opacity: 0.4; }
  .expanded { display: flex; gap: 10px; align-items: stretch; }
  .rail { display: flex; flex-direction: column; align-items: center; flex: none; }
  .line { flex: 1; width: 2px; margin-top: 6px; border-radius: 1px; background: var(--border); }
  .groups { display: flex; flex-direction: column; gap: 12px; flex: 1; min-width: 0; }
  .expand { padding: 0 10px; flex: none; color: var(--ink-2); }
  /* Same style as the slider labels: a field label, not a section marker. */
  .group-title { font-size: 13px; font-weight: 600; color: var(--ink-2); padding-left: 2px; margin-bottom: 6px; }
  /* One line that grows with the text; no drag handle on a phone. */
  .note { field-sizing: content; min-height: var(--tap); max-height: 40dvh; resize: none; }
  .area { background: var(--surface-2); color: var(--ink); border-color: transparent; padding-left: 6px; }
  .area[aria-pressed='true'] { background: var(--surface-2); color: var(--ink); border-color: var(--ink); }
  .dot {
    display: inline-flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: 50%;
    background: var(--c); color: var(--ink-on); font-weight: 700; font-size: 13px;
  }
</style>
