<script lang="ts">
  import { untrack } from 'svelte'
  import Sheet from './Sheet.svelte'
  import IntensitySlider from './IntensitySlider.svelte'
  import EntrySummary from './EntrySummary.svelte'
  import TimeChips from './TimeChips.svelte'
  import { t, tl } from '../i18n/index.svelte'
  import { logPreset } from '../lib/presets'
  import { deleteEntry } from '../lib/entries'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import { headline, layerLevel, symptomName } from '../lib/summary'
  import { intensityColor, intensityInk } from '../lib/color'
  import type { Preset, Symptom } from '../lib/types'

  let { preset = $bindable(null), symptoms = [], onsaved }: { preset: Preset | null; symptoms?: Symptom[]; onsaved?: (p: Preset) => void } = $props()

  let open = $state(false)
  let current = $state.raw<Preset | null>(null)
  /** One record per layer (§5.6): the level of every symptom it asks for. */
  let levels = $state<Record<string, number>[]>([])
  /** The layer the sliders edit. */
  let cur = $state(0)
  /** The reference time of the reading (§5.6): now unless said otherwise. */
  let at = $state<string | null>(null)

  // Reacts to the preset, to nothing else.
  $effect(() => {
    const p = preset
    if (!p) return
    untrack(() => {
      dismissToast()
      current = p
      // Every slider starts at 0 (§5.6): a reading is what it is now, never what it was.
      levels = p.layers.map((l) => Object.fromEntries(l.asks.map((id) => [id, 0])))
      cur = 0
      at = null
      open = true
    })
  })
  $effect(() => {
    if (!open) preset = null
  })

  const label = (id: string) => tl(symptoms.find((s) => s.id === id)?.label ?? { it: id, en: id })
  /** Each layer as it stands in the sheet, for the summary and the chips: its regions and its levels, no tags. */
  const shown = $derived((current?.layers ?? []).map((l, i) => ({ regions: l.regions, readings: levels[i] ?? {}, tags: [] })))

  async function save() {
    if (!current) return
    const entry = await logPreset(current, levels.map((l) => ({ ...l })), at ?? undefined)
    haptic(20)
    open = false
    onsaved?.(current)
    showToast(t('log.saved'), { label: t('log.undo'), run: () => void deleteEntry(entry.id) })
  }
</script>

<Sheet bind:open title={current?.name ?? ''}>
  {#if current}
    {#if current.layers.some((l) => l.regions.length)}
      <div class="card small"><EntrySummary layers={shown} /></div>
    {/if}
    <TimeChips bind:value={at} label={t('time.when')} none={t('time.now')} />
    <!-- Several layers: the sliders follow the selected chip, as in the episode sheet (§5.5). -->
    {#if shown.length > 1}
      <div class="chips layers">
        {#each shown as l, i (i)}
          {@const level = layerLevel(l)}
          <button class="chip small area" aria-pressed={i === cur} style="--c: {intensityColor(level)}; --ink-on: {intensityInk(level)}" onclick={() => (cur = i)}>
            <span class="dot">{level}</span>
            <EntrySummary lead={symptomName(headline(l.readings).id, symptoms, tl)} layers={[l]} />
          </button>
        {/each}
      </div>
    {/if}
    {#each current.layers[cur]?.asks ?? [] as id, i (`${cur}:${id}`)}
      <IntensitySlider compact={i > 0} label={label(id)} value={levels[cur]?.[id] ?? 0} onchange={(v) => (levels[cur][id] = v)} />
    {/each}
    <button class="btn primary block" onclick={save}>{t('common.save')}</button>
  {/if}
</Sheet>

<style>
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
