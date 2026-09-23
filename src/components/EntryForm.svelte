<script lang="ts">
  import { untrack, type Snippet } from 'svelte'
  import Stage from './Stage.svelte'
  import ToolButton from './ToolButton.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import TimeChips, { timeLabel } from './TimeChips.svelte'
  import { regionText, layerLevel, headline, symptomName } from '../lib/summary'
  import { t, tl } from '../i18n/index.svelte'
  import { prefs, savePrefs } from '../lib/prefs.svelte'
  import { intensityColor, intensityInk } from '../lib/color'
  import { PAIN, type Symptom, type Tag, type TagGroup } from '../lib/types'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { frequentTags } from '../lib/vocab'
  import { LEG_IDS, ARM_IDS, HEAD_IDS, TORSO_IDS, sided, type View } from '../lib/regions'
  import { isFull, showsCategory, readingsFor, tapRegion, tapSet, toggleFull, addLayer, selectLayer, setReading, toggleTag, pieceCount, type LayerState } from '../lib/layers'
  import { addStroke, undoStroke, clearStrokes, mainView, type RawStroke } from '../lib/strokes'
  import { isMindSymptom } from '../lib/vocabulary'
  import { ICONS } from '../lib/icons'
  import type { EntryDraft } from '../lib/draft'
  import { haptic, showToast } from '../lib/toast.svelte'

  /**
   * The form (#22) is a stage with a drawer over it. The stage keeps its size; the drawer slides up over it. Collapsed,
   * the drawer shows the fast path: the layer tabs, the current layer's panel with its headline slider (pain when the
   * layer shows the body, the first mind symptom otherwise) and `actions`, the Salva bar. Open, the panel goes on with
   * the layer's other sliders and its tags, and below the panel come the entry's own fields: kind and time, the note.
   * So what belongs to a layer sits in its panel under its tab, and what belongs to the entry sits outside.
   *
   * `lock` (§5.5): 'kind' for a head that has updates, which stays an episode (its end still moves); 'reading' for an
   * update, a reading of its episode, whose kind and end are the head's. `mode` 'preset' (§5.6) is the shape alone:
   * the stage, the layers and the kind, nothing to open; `reading` then stands in for the slider (the Chiede chips).
   * `more` goes at the end of the entry's fields (Crea preset da questa voce).
   */
  let {
    draft = $bindable(),
    symptoms = [],
    tags = [],
    lock = 'none',
    mode = 'entry',
    actions,
    reading,
    more,
  }: {
    draft: EntryDraft
    symptoms?: Symptom[]
    tags?: Tag[]
    lock?: 'none' | 'kind' | 'reading'
    mode?: 'entry' | 'preset'
    actions?: Snippet
    reading?: Snippet
    more?: Snippet
  } = $props()

  // The strip: every enabled tag, the most used first (§6.1). Expanded, the same tags by group take its place.
  const entries = live(() => null, () => db.entries.toArray(), [])
  const suggestions = $derived(frequentTags(entries.value, tags))
  let allTags = $state(false)
  // Paint (§5.3): a finger shades the current layer instead of tapping segments.
  let paint = $state(false)
  let view = $state<View>('front')
  /** The drawer pulled up over the stage. */
  let open = $state(false)
  /** The drawer's collapsed height, measured, so the stage ends where it begins and never moves. */
  let stage: Stage | undefined = $state()
  let innerH = $state(0)
  let peek = $state(0)
  $effect(() => {
    if (!open) peek = innerH
  })
  const curStrokes = $derived(draft.layers[draft.cur]?.strokes?.length ?? 0)
  /** Gestures of this draft, newest last: how many pieces each added and the count it left, so Annulla tratto can take a whole gesture back. */
  let gestures: { n: number; total: number }[] = []
  // A new draft (save, clear, another entry to edit) folds everything away and opens on the view holding most of it.
  $effect(() => {
    void draft
    allTags = false
    paint = false
    open = false
    gestures = []
    view = untrack(() => mainView(draft.layers.flatMap((l) => l.regions)))
    untrack(() => stage?.refit())
  })
  const groups: TagGroup[] = ['intervention', 'context', 'medication']
  const tagsByGroup = $derived(groups.map((g) => ({ g, items: tags.filter((x) => x.enabled && x.group === g) })).filter((x) => x.items.length))
  const bodySymptoms = $derived(symptoms.filter((s) => s.enabled && s.id !== PAIN && !isMindSymptom(s)))
  const mindSymptoms = $derived(symptoms.filter((s) => s.enabled && isMindSymptom(s)))

  /** The layer the stage, the sliders and the tag strip edit (§5.4). */
  const cur = $derived(draft.layers[draft.cur] ?? draft.layers[0])
  const st = (): LayerState => ({ layers: draft.layers, cur: draft.cur })
  /** Which sliders show (§6.1) follows the current layer: body regions, the body ones; the brain, the mind ones; nothing, all. */
  const showBody = $derived(showsCategory(cur, 'body'))
  const showMind = $derived(showsCategory(cur, 'mind'))
  /** The headline slider of the panel: pain for a layer showing the body, else the first mind symptom; the rest follow when open. */
  const headSym = $derived(showBody ? null : (mindSymptoms[0] ?? null))
  const restMind = $derived(showBody ? mindSymptoms : mindSymptoms.slice(1))
  /** The layers as they will be saved: a layer is coloured and numbered by the readings its regions show, not by a hidden slider. */
  const shown = $derived(draft.layers.map((l) => ({ ...l, readings: readingsFor(l, l.readings, symptoms) })))
  const pain = $derived(cur.readings[PAIN] ?? 0)
  const full = $derived(isFull(cur))
  const curRegions = $derived(cur.regions)
  const setOn = (ids: string[]) => !full && ids.every((id) => curRegions.includes(id))
  const located = $derived(draft.layers.some((l) => l.regions.length > 0))
  const painLabel = $derived.by(() => {
    const base = tl(symptoms.find((s) => s.id === PAIN)?.label ?? { it: 'Dolore', en: 'Pain' })
    return draft.layers.length > 1 && cur.regions.length ? `${base} · ${regionText(cur.regions, t)}` : base
  })
  /** The handle says what the drawer holds that is not the default: a time, or an end. */
  const handleLabel = $derived.by(() => {
    if (open) return t('log.body')
    const when = draft.at ? timeLabel(draft.at) : draft.endedAt && lock !== 'reading' ? `${t('time.end')} ${timeLabel(draft.endedAt, false)}` : null
    return when ? `${t('log.more')} · ${when}` : t('log.more')
  })
  /** The quick sets of the rail (#22), a row each: with mirror on, a limb is both sides; off, its two sides share the row. */
  const quick = $derived.by(() => {
    const limbs = prefs.mirror
      ? [
          [{ ids: LEG_IDS, icon: ICONS.legs, label: t('log.legs') }],
          [{ ids: ARM_IDS, icon: ICONS.arms, label: t('log.arms') }],
        ]
      : [
          [
            { ids: sided(LEG_IDS, 'l'), icon: ICONS.legs, label: t('log.legL') },
            { ids: sided(LEG_IDS, 'r'), icon: ICONS.legs, label: t('log.legR') },
          ],
          [
            { ids: sided(ARM_IDS, 'l'), icon: ICONS.arms, label: t('log.armL') },
            { ids: sided(ARM_IDS, 'r'), icon: ICONS.arms, label: t('log.armR') },
          ],
        ]
    return [[{ ids: HEAD_IDS, icon: ICONS.head, label: t('log.head') }], [{ ids: TORSO_IDS, icon: ICONS.torso, label: t('log.torso') }], ...limbs]
  })

  function apply(next: LayerState) {
    draft.layers = next.layers
    draft.cur = next.cur
  }
  function onRegion(id: string) {
    withPaintToast(() => apply(tapRegion(st(), id, { sides: prefs.mirror, views: prefs.mirrorViews })))
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
  function onFull() {
    withPaintToast(() => apply(toggleFull(st())))
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
  function setMirrorViews(v: boolean) {
    prefs.mirrorViews = v
    savePrefs()
  }
  function onTag(id: string) {
    apply(toggleTag(st(), id))
  }
  /** A new layer starts at the current pain level, like the first did (§5.4), and the next thing to do is choose where. */
  function onAddLayer() {
    apply(addLayer(st(), { [PAIN]: pain }))
    open = false
  }

  /** The handle: a tap toggles the drawer, a vertical drag of a few pixels slides it the way it goes. */
  let dragY: number | null = null
  let dragged = false
  function hdown(e: PointerEvent) {
    // The finger leaves the button long before the threshold: keep its events.
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    dragY = e.clientY
    dragged = false
  }
  function hmove(e: PointerEvent) {
    if (dragY === null) return
    const dy = e.clientY - dragY
    if (Math.abs(dy) < 24) return
    open = dy < 0
    dragged = true
    dragY = null
  }
  function hup() {
    dragY = null
  }
  function hclick() {
    if (dragged) dragged = false
    else open = !open
  }
</script>

{#snippet compact(s: Symptom)}
  <IntensitySlider compact label={tl(s.label)} value={cur.readings[s.id] ?? 0} onchange={(v) => onReading(s.id, v)} />
{/snippet}

<!-- The kind (§5.1): one switch with two halves, since an entry is one or the other. -->
{#snippet kind()}
  {#if lock === 'none'}
    <div class="seg" role="group" aria-label={t('log.kind.label')}>
      <button class="chip small" aria-pressed={draft.kind === 'chronic'} onclick={() => (draft.kind = 'chronic')}>{t('log.kind.chronic')}</button>
      <button class="chip small" aria-pressed={draft.kind === 'episode'} onclick={() => (draft.kind = 'episode')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        {t('log.kind.episode')}
      </button>
    </div>
  {/if}
{/snippet}

{#snippet expander()}
  <button class="chip small expand" aria-expanded={allTags} aria-label={t('log.allTags')} onclick={() => (allTags = !allTags)}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {#if allTags}<path d="M6 15l6-6 6 6" />{:else}<path d="M6 9l6 6 6-6" />{/if}
    </svg>
  </button>
{/snippet}

<div class="form">
  <div class="slot" style="bottom: {peek}px">
    <Stage bind:this={stage} bind:view {paint} layers={shown} cur={draft.cur} onToggle={onRegion} {onStroke} labels={{ front: t('log.front'), back: t('log.back'), mind: t('log.mind') }}>
      {#snippet tools()}
          <ToolButton icon={ICONS.body} label={t('log.fullBody')} caption={t('log.fullShort')} pressed={full} onclick={onFull} />
          {#each quick as row (row[0].label)}
            <div class="row">
              {#each row as q (q.label)}
                <ToolButton icon={q.icon} label={q.label} pressed={setOn(q.ids)} disabled={full} onclick={() => onSet(q.ids)} />
              {/each}
            </div>
          {/each}
          <!-- The two mirrors last, on one row: they are settings of the taps above, not sets of their own. -->
          <div class="row">
            <ToolButton icon={ICONS.flip} label={t('log.mirrorViews')} caption={t('log.mirrorViewsShort')} pressed={prefs.mirrorViews} onclick={() => setMirrorViews(!prefs.mirrorViews)} />
            <ToolButton icon={ICONS.mirror} label={t('log.mirror')} caption={t('log.mirrorShort')} pressed={prefs.mirror} onclick={() => setMirror(!prefs.mirror)} />
          </div>
      {/snippet}
      <!-- The brush and, while it is on, its undo and clear right above it, so the brush itself stays put. -->
      {#snippet extra()}
        {#if paint}
          <ToolButton compact icon={ICONS.undo} label={t('log.undoStroke')} disabled={!curStrokes} onclick={onUndoStroke} />
          <ToolButton compact icon={ICONS.clear} label={t('log.clearDrawing')} disabled={!curStrokes} onclick={onClearDrawing} />
        {/if}
        <ToolButton icon={ICONS.brush} label={t('log.draw')} pressed={paint} onclick={() => (paint = !paint)} />
      {/snippet}
    </Stage>
  </div>

  <div class="drawer" class:open style={open ? 'height: 100%' : peek ? `height: ${peek}px` : ''}>
    <div class="inner" bind:clientHeight={innerH}>
      <!-- The spine, the layer tabs: one layer without regions is the plain form; the chips appear once something is located (§6.1). -->
      <div class="spine">
        <div class="chips areas">
          {#if !located}
            <span class="small muted placeholder">{t('log.noArea')}</span>
          {:else}
            {#each shown as l, i (i)}
              {@const level = layerLevel(l)}
              <button
                class="chip small area"
                aria-pressed={i === draft.cur}
                style="--c: {intensityColor(level)}; --ink-on: {intensityInk(level)}"
                onclick={() => apply(selectLayer(st(), i))}>
                {#if mode !== 'preset'}<span class="dot">{level}</span>{/if}
                {#if l.regions.length}<EntrySummary lead={symptomName(headline(l.readings).id, symptoms, tl)} layers={[l]} tagDefs={tags} />{:else}<span class="muted">…</span>{/if}
              </button>
            {/each}
          {/if}
        </div>
        {#if cur.regions.length}
          <button class="chip small outline plus" aria-label={t('log.addArea')} onclick={onAddLayer}>+</button>
        {/if}
        {#if mode !== 'preset'}
          <button
            class="chip small outline handle"
            aria-expanded={open}
            onpointerdown={hdown}
            onpointermove={hmove}
            onpointerup={hup}
            onpointercancel={hup}
            onclick={hclick}>
            {handleLabel}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              {#if open}<path d="M6 9l6 6 6-6" />{:else}<path d="M6 15l6-6 6 6" />{/if}
            </svg>
          </button>
        {/if}
      </div>

      <div class="body">
        <!-- The current layer's panel: its headline first, then, open, its other sliders and its tags (§5.4). -->
        <div class="panel">
          {#if reading}
            {@render reading()}
          {:else if mode !== 'preset'}
            {#if showBody}
              <IntensitySlider value={pain} label={painLabel} onchange={(v) => onReading(PAIN, v)} />
            {:else if headSym}
              <IntensitySlider value={cur.readings[headSym.id] ?? 0} label={tl(headSym.label)} onchange={(v) => onReading(headSym!.id, v)} />
            {/if}
            <div class="rest" inert={!open} aria-hidden={!open}>
              {#if showBody}
                {#each bodySymptoms as s (s.id)}{@render compact(s)}{/each}
                {#if showMind}
                  {#each mindSymptoms as s (s.id)}{@render compact(s)}{/each}
                {/if}
              {:else}
                {#each restMind as s (s.id)}{@render compact(s)}{/each}
              {/if}
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
            </div>
          {/if}
        </div>

        <!-- The entry's own fields: two kinds of thing (§5.1), a chronic snapshot has a time; an episode has a start and, once over, an end. -->
        {#if mode === 'preset'}
          <div class="entry">{@render kind()}</div>
        {:else}
          <div class="entry rest" inert={!open} aria-hidden={!open}>
            {@render kind()}
            <!-- The time row keeps its caption whatever the kind, so nothing comes and goes: Quando, or Inizio with a Fine row of its own. -->
            {#if draft.kind === 'episode' && lock !== 'reading'}
              <TimeChips bind:value={draft.at} label={t('time.start')} caption={t('time.start')} none={t('time.now')} />
              <TimeChips bind:value={draft.endedAt} label={t('time.end')} caption={t('time.end')} none={t('log.ongoing')} nullIsNow={false} day={false} />
            {:else}
              <TimeChips bind:value={draft.at} label={t('time.when')} caption={t('time.when')} none={t('time.now')} />
            {/if}
            <textarea class="note" rows="1" placeholder={t('log.notePlaceholder')} bind:value={draft.note} aria-label={t('log.note')}></textarea>
            {@render more?.()}
          </div>
        {/if}
      </div>

      {@render actions?.()}
    </div>
  </div>
</div>

<style>
  .form { position: relative; flex: 1; min-height: 0; min-width: 0; }
  .slot { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
  /* The drawer sits over the stage: collapsed it is as tall as its fast path, open it is the whole form. The stage never moves. */
  .drawer {
    position: absolute; left: -12px; right: -12px; bottom: 0;
    display: flex; flex-direction: column;
    overflow: hidden;
    background: var(--surface);
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.08);
    transition: height 0.22s ease-out;
  }
  .inner { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px 8px; flex: none; min-width: 0; }
  .drawer.open .inner { flex: 1; min-height: 0; }
  .body { display: flex; flex-direction: column; gap: 10px; flex: none; min-height: 0; }
  .drawer.open .body { flex: 1; overflow-y: auto; margin: 0 -12px; padding: 0 12px; }
  .rest { display: none; }
  .drawer.open .rest { display: flex; flex-direction: column; gap: 12px; }
  .drawer.open .rest > :global(*) { flex: none; }
  /* The layer's panel: what the selected tab holds. */
  .panel { background: var(--bg); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 12px; flex: none; }
  .panel > :global(*) { min-width: 0; }
  .entry { flex: none; }
  .spine { display: flex; align-items: center; gap: 8px; flex: none; }
  .areas { flex: 1; min-height: 40px; align-items: center; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin-left: -12px; padding: 2px 4px 2px 12px; }
  .areas::-webkit-scrollbar { display: none; }
  .plus { flex: none; width: 36px; padding: 0; justify-content: center; font-size: 18px; }
  .handle { flex: none; padding-right: 8px; touch-action: none; }
  .placeholder { padding-left: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* The kind switch: one pill, two halves, the pressed one filled. */
  .seg { display: inline-flex; align-self: flex-start; border: 1.5px solid var(--border); border-radius: 999px; padding: 2px; gap: 2px; }
  .seg .chip { background: transparent; border: 0; min-height: 30px; }
  .seg .chip[aria-pressed='true'] { background: var(--accent); color: var(--accent-ink); }
  .suggest { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -12px; padding: 2px 12px; }
  .suggest::-webkit-scrollbar { display: none; }
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
  @media (prefers-reduced-motion: reduce) { .drawer { transition: none; } }
</style>
