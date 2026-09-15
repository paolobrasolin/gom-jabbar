<script lang="ts">
  import Sheet from './Sheet.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import { t, tl } from '../i18n/index.svelte'
  import { logPreset } from '../lib/presets'
  import { deleteEntry } from '../lib/entries'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import { PAIN, type Entry, type Preset, type Symptom, type Tag } from '../lib/types'

  let {
    preset = $bindable(null),
    last,
    symptoms = [],
    tagDefs = [],
  }: { preset: Preset | null; last?: Entry; symptoms?: Symptom[]; tagDefs?: Tag[] } = $props()

  let open = $state(false)
  let current = $state.raw<Preset | null>(null)
  let levels = $state<Record<string, number>>({})

  $effect(() => {
    if (preset) {
      dismissToast()
      current = preset
      // Start from the last logged levels: for something that is always there, only the level drifts.
      const lv: Record<string, number> = {}
      for (const id of preset.symptomIds) lv[id] = last?.preset === preset.id ? (last.readings[id] ?? 0) : id === PAIN ? 5 : 0
      levels = lv
      open = true
    }
  })
  $effect(() => {
    if (!open) preset = null
  })

  const label = (id: string) => tl(symptoms.find((s) => s.id === id)?.label ?? { it: id, en: id })

  async function save() {
    if (!current) return
    const entry = await logPreset(current, { ...levels })
    haptic(20)
    open = false
    showToast(t('log.saved'), { label: t('log.undo'), run: () => void deleteEntry(entry.id) })
  }
</script>

<Sheet bind:open title={current?.name ?? ''}>
  {#if current}
    {#if current.areas.length || current.tags.length}
      <div class="card small"><EntrySummary areas={current.areas} tags={current.tags} {tagDefs} /></div>
    {/if}
    {#each current.symptomIds as id, i (id)}
      <IntensitySlider compact={i > 0} label={label(id)} value={levels[id] ?? 0} onchange={(v) => (levels[id] = v)} />
    {/each}
    <button class="btn primary block" onclick={save}>{t('common.save')}</button>
  {/if}
</Sheet>
