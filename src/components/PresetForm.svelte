<script module lang="ts">
  import type { EntryDraft } from '../lib/draft'
  import type { Preset } from '../lib/types'
  /** What the sheet opens on (§5.6): a draft to name as a new preset, or a preset to edit in place. */
  export type PresetSeed = { draft: EntryDraft } | { preset: Preset }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import Sheet from './Sheet.svelte'
  import EntryForm from './EntryForm.svelte'
  import { t, tl } from '../i18n/index.svelte'
  import { emptyDraft, copyLayers } from '../lib/draft'
  import { addPreset, updatePreset, deletePreset, restorePreset, presetFromDraft, defaultAsks } from '../lib/presets'
  import { showsCategory, type Layer } from '../lib/layers'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import { PAIN, type Symptom } from '../lib/types'

  let {
    seed = $bindable(null),
    symptoms = [],
    oncreate,
    onundo,
  }: { seed: PresetSeed | null; symptoms?: Symptom[]; oncreate?: (p: Preset) => void; onundo?: (p: Preset) => void } = $props()

  let open = $state(false)
  let draft = $state<EntryDraft>(emptyDraft())
  let name = $state('')
  let editing = $state.raw<Preset | null>(null)

  // Load on a new seed only: what the form reads afterwards (its own draft, the vocabulary) must not reload it.
  $effect(() => {
    const s = seed
    if (!s) return
    untrack(() => {
      dismissToast()
      if ('preset' in s) {
        editing = s.preset
        // A shape has no levels: a nominal 5 on what each layer asks, so the map shows it.
        const layers = s.preset.layers.map((l) => ({ regions: [...l.regions], readings: Object.fromEntries(l.asks.map((id) => [id, 5])), tags: [], asks: [...l.asks], ...(l.strokes ? { strokes: l.strokes } : {}) }))
        draft = { ...emptyDraft({ kind: s.preset.kind }), ...(layers.length ? { layers: copyLayers(layers) } : {}) }
        name = s.preset.name
      } else {
        editing = null
        draft = { ...s.draft, layers: copyLayers(s.draft.layers), cur: Math.min(s.draft.cur, s.draft.layers.length - 1) }
        name = ''
      }
      open = true
    })
  })
  $effect(() => {
    if (!open) seed = null
  })

  /** What a layer can ask for (§5.6): each enabled symptom its regions show, pain first, in vocabulary order. */
  const askableFor = (l: Layer): Symptom[] => symptoms.filter((s) => s.enabled && showsCategory(l, s.category)).sort((a, b) => Number(b.id === PAIN) - Number(a.id === PAIN))
  /** What a layer asks for: its own list once the chips set one, else the default; explicit, so a symptom at 0 today still belongs. */
  const asksOf = (l: Layer): string[] => l.asks ?? defaultAsks(l)
  const asksFor = (l: Layer): string[] => askableFor(l).map((s) => s.id).filter((id) => asksOf(l).includes(id))
  /** The chips follow the current layer, like the tag strip of the log form (§5.4). */
  const cur = $derived(draft.layers[draft.cur] ?? draft.layers[0])
  const askable = $derived(askableFor(cur))
  const asked = $derived(asksOf(cur))
  /** A name is all it takes (§5.6): a layer asking nothing is a location that records no reading, and a preset asking nothing is a one-tap "nothing to report". */
  const ready = $derived(name.trim() !== '')

  function toggle(id: string) {
    const l = draft.layers[draft.cur] ?? draft.layers[0]
    const now = asksOf(l)
    l.asks = now.includes(id) ? now.filter((x) => x !== id) : [...now, id]
  }

  async function save() {
    if (!ready) return
    const shaped = { ...draft, layers: draft.layers.map((l) => ({ ...l, asks: asksFor(l) })) }
    const input = presetFromDraft(shaped, name, symptoms)
    haptic(20)
    if (editing) {
      const before = editing
      const next = await updatePreset(before.id, input)
      open = false
      if (next) showToast(t('preset.saved'), { label: t('log.undo'), run: () => void restorePreset(before) })
    } else {
      const p = await addPreset(input)
      open = false
      oncreate?.(p)
      showToast(t('preset.created'), {
        label: t('log.undo'),
        run: () => {
          void deletePreset(p.id)
          onundo?.(p)
        },
      })
    }
  }
</script>

<Sheet bind:open title={editing ? t('preset.edit') : t('preset.new')} tall>
  <input class="name" type="text" placeholder={t('preset.name')} aria-label={t('preset.name')} bind:value={name} onkeydown={(e) => e.key === 'Enter' && save()} />
  <EntryForm bind:draft {symptoms} mode="preset">
    {#snippet reading()}
      <div role="group" aria-label={t('preset.asks')}>
        <p class="group-title">{t('preset.asks')}</p>
        <div class="chips">
          {#each askable as s (s.id)}
            <button class="chip small" aria-pressed={asked.includes(s.id)} onclick={() => toggle(s.id)}>{tl(s.label)}</button>
          {/each}
        </div>
      </div>
    {/snippet}
    {#snippet actions()}
      <button class="btn primary block" disabled={!ready} onclick={save}>{editing ? t('common.save') : t('preset.create')}</button>
    {/snippet}
  </EntryForm>
</Sheet>

<style>
  .name { flex: none; min-height: 44px; padding: 0 10px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); min-width: 0; font-size: 16px; }
  .group-title { font-size: 13px; font-weight: 600; color: var(--ink-2); padding-left: 2px; margin-bottom: 6px; }
  .chip[aria-pressed='false'] { border-color: var(--border); }
</style>
