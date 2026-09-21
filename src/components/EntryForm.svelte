<script lang="ts">
  import BodyMap from './BodyMap.svelte'
  import PaintSurface from './PaintSurface.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import { regionText, layerLevel, headline, symptomName } from '../lib/summary'
  import { t, tl, locale } from '../i18n/index.svelte'
  import { prefs, savePrefs } from '../lib/prefs.svelte'
  import { intensityColor, intensityInk } from '../lib/color'
  import { PAIN, type Symptom, type Tag, type TagGroup } from '../lib/types'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { frequentTags } from '../lib/vocab'
  import { LEG_IDS, ARM_IDS, limbOf, mirrorId, type View } from '../lib/regions'
  import { isFull, showsCategory, readingsFor, tapRegion, tapSet, toggleFull, addLayer, selectLayer, setReading, toggleTag, pieceCount, type LayerState } from '../lib/layers'
  import { addStroke, undoStroke, clearStrokes, mainView, type RawStroke } from '../lib/strokes'
  import { isMindSymptom } from '../lib/vocabulary'
  import { toLocalInput, fromLocalInput, thisMorning, lastNight, hoursAgo, formatTime, formatDay } from '../lib/time'
  import type { EntryDraft } from '../lib/draft'
  import { haptic, showToast } from '../lib/toast.svelte'

  let { draft = $bindable(), symptoms = [], tags = [] }: { draft: EntryDraft; symptoms?: Symptom[]; tags?: Tag[] } = $props()

  let showPicker = $state(false)

  // The strip: every enabled tag, the most used first (§6.1 item 8). Expanded, the same tags by group take its place.
  const entries = live(() => null, () => db.entries.toArray(), [])
  const suggestions = $derived(frequentTags(entries.value, tags))
  let allTags = $state(false)
  // Drawing mode (§5.3): one figure enlarged, a finger shades the current layer.
  let drawing = $state(false)
  let drawView = $state<View>('front')
  const curStrokes = $derived(draft.layers[draft.cur]?.strokes?.length ?? 0)
  /** Gestures of this draft, newest last: how many pieces each added and the count it left, so Annulla tratto can take a whole gesture back. */
  let gestures: { n: number; total: number }[] = []
  // A new draft (save, clear, another entry to edit) folds the full list away and leaves drawing mode.
  $effect(() => {
    void draft
    allTags = false
    drawing = false
    gestures = []
  })
  const groups: TagGroup[] = ['intervention', 'context', 'medication']
  const tagsByGroup = $derived(groups.map((g) => ({ g, items: tags.filter((x) => x.enabled && x.group === g) })).filter((x) => x.items.length))
  const bodySymptoms = $derived(symptoms.filter((s) => s.enabled && s.id !== PAIN && !isMindSymptom(s)))
  const mindSymptoms = $derived(symptoms.filter((s) => s.enabled && isMindSymptom(s)))

  /** The layer the map, the sliders and the tag strip edit (§5.4). */
  const cur = $derived(draft.layers[draft.cur] ?? draft.layers[0])
  const st = (): LayerState => ({ layers: draft.layers, cur: draft.cur })
  /** Which sliders show (§6.1) follows the current layer: body regions, the body ones; the brain, the mind ones; nothing, all. */
  const showBody = $derived(showsCategory(cur, 'body'))
  const showMind = $derived(showsCategory(cur, 'mind'))
  /** The layers as they will be saved: a layer is coloured and numbered by the readings its regions show, not by a hidden slider. */
  const shown = $derived(draft.layers.map((l) => ({ ...l, readings: readingsFor(l, l.readings, symptoms) })))
  const pain = $derived(cur.readings[PAIN] ?? 0)
  const full = $derived(isFull(cur))
  const curRegions = $derived(cur.regions)
  const legsOn = $derived(!full && LEG_IDS.every((id) => curRegions.includes(id)))
  const armsOn = $derived(!full && ARM_IDS.every((id) => curRegions.includes(id)))
  const located = $derived(draft.layers.some((l) => l.regions.length > 0))
  const painLabel = $derived.by(() => {
    const base = tl(symptoms.find((s) => s.id === PAIN)?.label ?? { it: 'Dolore', en: 'Pain' })
    return draft.layers.length > 1 && cur.regions.length ? `${base} · ${regionText(cur.regions, t)}` : base
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

  function apply(next: LayerState) {
    draft.layers = next.layers
    draft.cur = next.cur
  }
  function onRegion(id: string) {
    withPaintToast(() => apply(tapRegion(st(), id, prefs.mirror)))
    haptic(6)
  }
  function onSet(ids: string[]) {
    withPaintToast(() => apply(tapSet(st(), ids)))
  }
  /** Deselecting takes the paint of the segment along (§5.4): when it does, offer to undo. */
  function withPaintToast(change: () => void) {
    const before = draft.layers
    const had = pieceCount(before)
    change()
    if (pieceCount(draft.layers) < had) showToast(t('log.strokesErased'), { label: t('log.undo'), run: () => (draft.layers = before) })
  }
  function onLimb(id: string) {
    let ids = limbOf(id)
    if (prefs.mirror) ids = [...new Set(ids.flatMap((x) => [x, mirrorId(x) ?? x]))]
    onSet(ids)
    haptic(25)
  }
  function onFull() {
    withPaintToast(() => apply(toggleFull(st())))
  }
  function toggleDrawing() {
    drawing = !drawing
    if (drawing) drawView = mainView(curRegions)
  }
  function onStroke(raw: RawStroke) {
    const before = pieceCount(draft.layers)
    apply(addStroke(st(), raw))
    const total = pieceCount(draft.layers)
    if (total > before) gestures.push({ n: total - before, total })
    haptic(6)
  }
  /** The last gesture, while its pieces are still the last ones; otherwise one piece. */
  function onUndoStroke() {
    const last = gestures.pop()
    const n = last && last.total === pieceCount(draft.layers) ? last.n : 1
    apply(undoStroke(st(), n))
  }
  function onClearDrawing() {
    const before = draft.layers
    apply(clearStrokes(st()))
    showToast(t('log.drawingCleared'), { label: t('log.undo'), run: () => (draft.layers = before) })
  }
  function onReading(id: string, v: number) {
    apply(setReading(st(), id, v))
  }
  function setMirror(v: boolean) {
    prefs.mirror = v
    savePrefs()
  }
  function onTag(id: string) {
    apply(toggleTag(st(), id))
  }
  /** A new layer starts at the current pain level, like the first did (§5.4). */
  function onAddLayer() {
    apply(addLayer(st(), { [PAIN]: pain }))
  }
</script>

<div class="form">
  <div class="chips tools">
    <button class="chip small" aria-pressed={prefs.mirror} onclick={() => setMirror(!prefs.mirror)}>{t('log.mirror')}</button>
    <button class="chip small" aria-pressed={full} onclick={onFull}>{t('log.fullBody')}</button>
    <button class="chip small" aria-pressed={legsOn} disabled={full} onclick={() => onSet(LEG_IDS)}>{t('log.legs')}</button>
    <button class="chip small" aria-pressed={armsOn} disabled={full} onclick={() => onSet(ARM_IDS)}>{t('log.arms')}</button>
    <button class="chip small" aria-pressed={drawing} onclick={toggleDrawing}>{t('log.draw')}</button>
  </div>

  <!-- The map and the drawing surface swap in the same slot: whichever layout comes next (#22) composes the same pieces. -->
  <div class="map">
    {#if drawing}
      <PaintSurface view={drawView} layers={shown} cur={draft.cur} label={t(`log.${drawView}`)} {onStroke} />
    {:else}
      <BodyMap layers={shown} cur={draft.cur} onToggle={onRegion} onLongPress={onLimb} labels={{ front: t('log.front'), back: t('log.back'), mind: t('log.mind') }} />
    {/if}
  </div>

  {#if drawing}
    <div class="chips drawbar">
      <button class="chip small" aria-pressed={drawView === 'front'} onclick={() => (drawView = 'front')}>{t('log.front')}</button>
      <button class="chip small" aria-pressed={drawView === 'back'} onclick={() => (drawView = 'back')}>{t('log.back')}</button>
      <span class="grow"></span>
      <button class="chip small outline" disabled={!curStrokes} onclick={onUndoStroke}>{t('log.undoStroke')}</button>
      <button class="chip small outline" disabled={!curStrokes} onclick={onClearDrawing}>{t('log.clearDrawing')}</button>
    </div>
    <p class="small muted hint">{t('log.drawHint')}</p>
  {/if}

  <!-- One layer without regions is the plain form; the chips appear once something is located (§6.1). -->
  <div class="chips areas">
    {#if !located}
      <span class="small muted placeholder">{t('log.noArea')}</span>
    {:else}
      {#each shown as l, i (i)}
        {@const level = layerLevel(l)}
        <button
          class="chip small area"
          class:current={i === draft.cur}
          aria-pressed={i === draft.cur}
          style="--c: {intensityColor(level)}; --ink-on: {intensityInk(level)}"
          onclick={() => apply(selectLayer(st(), i))}>
          <span class="dot">{level}</span>
          {#if l.regions.length}<EntrySummary lead={symptomName(headline(l.readings).id, symptoms, tl)} layers={[l]} tagDefs={tags} />{:else}<span class="muted">…</span>{/if}
        </button>
      {/each}
      {#if cur.regions.length}
        <button class="chip small outline" onclick={onAddLayer}>+ {t('log.addArea')}</button>
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

  <!-- The tag strip belongs to the current layer (§5.4): a remedy for the legs is not one for the head. -->
  {#if !allTags}
    <div class="chips suggest" aria-label={t('log.suggestions')}>
      {@render expander()}
      {#each suggestions as tag (tag.id)}
        <button class="chip small" aria-pressed={cur.tags.includes(tag.id)} onclick={() => onTag(tag.id)}>{tl(tag.label)}</button>
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
                <button class="chip small" aria-pressed={cur.tags.includes(tag.id)} onclick={() => onTag(tag.id)}>{tl(tag.label)}</button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if showBody}
    <IntensitySlider value={pain} label={painLabel} onchange={(v) => onReading(PAIN, v)} />
    {#each bodySymptoms as s (s.id)}
      <IntensitySlider compact label={tl(s.label)} value={cur.readings[s.id] ?? 0} onchange={(v) => onReading(s.id, v)} />
    {/each}
  {/if}
  {#if showMind}
    {#each mindSymptoms as s (s.id)}
      <IntensitySlider compact label={tl(s.label)} value={cur.readings[s.id] ?? 0} onchange={(v) => onReading(s.id, v)} />
    {/each}
  {/if}

  <textarea class="note" rows="1" placeholder={t('log.notePlaceholder')} bind:value={draft.note} aria-label={t('log.note')}></textarea>
</div>

<style>
  .form { display: flex; flex-direction: column; gap: 12px; min-width: 0; flex: 1; }
  .form > * { min-width: 0; }
  .areas { min-height: 40px; align-items: center; }
  .placeholder { padding-left: 4px; }
  .drawbar { align-items: center; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -12px; padding: 2px 12px; }
  .drawbar::-webkit-scrollbar { display: none; }
  .grow { flex: 1; }
  .hint { margin-top: -4px; line-height: 1.25; }
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
