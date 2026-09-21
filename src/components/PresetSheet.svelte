<script lang="ts">
  import Sheet from './Sheet.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import TimeChips from './TimeChips.svelte'
  import { t, tl } from '../i18n/index.svelte'
  import { logPreset } from '../lib/presets'
  import { deleteEntry } from '../lib/entries'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import { PAIN, type Entry, type Preset, type Symptom, type Tag } from '../lib/types'
  import { mergedReadings } from '../lib/layers'

  let {
    preset = $bindable(null),
    last,
    symptoms = [],
    tagDefs = [],
  }: { preset: Preset | null; last?: Entry; symptoms?: Symptom[]; tagDefs?: Tag[] } = $props()

  let open = $state(false)
  let current = $state.raw<Preset | null>(null)
  let levels = $state<Record<string, number>>({})
  /** The reference time of the reading (§5.6): now unless said otherwise. */
  let at = $state<string | null>(null)

  $effect(() => {
    if (preset) {
      dismissToast()
      current = preset
      // Start from the last logged levels: for something that is always there, only the level drifts.
      const lv: Record<string, number> = {}
      const before = last ? mergedReadings(last.layers) : null
      for (const id of preset.symptomIds) lv[id] = before ? (before[id] ?? 0) : id === PAIN ? 5 : 0
      levels = lv
      at = null
      open = true
    }
  })
  $effect(() => {
    if (!open) preset = null
  })

  const label = (id: string) => tl(symptoms.find((s) => s.id === id)?.label ?? { it: id, en: id })

  async function save() {
    if (!current) return
    const entry = await logPreset(current, { ...levels }, at ?? undefined)
    haptic(20)
    open = false
    showToast(t('log.saved'), { label: t('log.undo'), run: () => void deleteEntry(entry.id) })
  }
</script>

<Sheet bind:open title={current?.name ?? ''}>
  {#if current}
    {#if current.layers.some((l) => l.regions.length || l.tags.length)}
      <div class="card small"><EntrySummary layers={current.layers} {tagDefs} /></div>
    {/if}
    <TimeChips bind:value={at} label={t('time.when')} none={t('time.now')} />
    {#each current.symptomIds as id, i (id)}
      <IntensitySlider compact={i > 0} label={label(id)} value={levels[id] ?? 0} onchange={(v) => (levels[id] = v)} />
    {/each}
    <button class="btn primary block" onclick={save}>{t('common.save')}</button>
  {/if}
</Sheet>
