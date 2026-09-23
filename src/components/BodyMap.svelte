<!--
  The read-only pair (§6.3, §7): front and back side by side with the mind between, under a heatmap.
  The figure you touch is the stage (Stage.svelte, #22).
-->
<script lang="ts">
  import BodyFigure from './BodyFigure.svelte'
  import Mind from './Mind.svelte'
  import { figureBox, type View } from '../lib/regions'
  import { prefs } from '../lib/prefs.svelte'
  import type { HeatStroke } from '../lib/strokes'

  let {
    heat,
    strokes = [],
    labels = { front: '', back: '' },
  }: {
    /** Per-region mean intensity and weight (0..1) driving opacity. */
    heat?: Map<string, { mean: number; weight: number }>
    /** Strokes to shade over the figures, each with its level. */
    strokes?: HeatStroke[]
    labels?: { front: string; back: string; mind?: string }
  } = $props()

  const box = $derived(figureBox(prefs.figure))
  const views: View[] = ['front', 'back']
</script>

<div class="maps">
  {#each views as view (view)}
    <div class="figure">
      <svg viewBox="-4 -4 {box.w + 8} {box.h + 8}" role="group" aria-label={labels[view]}>
        <BodyFigure {view} {heat} {strokes} readonly />
      </svg>
      {#if labels[view]}<span class="label">{labels[view]}</span>{/if}
    </div>
    {#if view === 'front'}
      <!-- The mind sits between the two heads, in the air the columns leave there, and takes no room of its own. -->
      <div class="mind"><Mind {heat} readonly label={labels.mind} /></div>
    {/if}
  {/each}
</div>

<style>
  .maps { position: relative; display: flex; justify-content: center; gap: 8px; height: 100%; width: 100%; }
  .figure { display: flex; flex-direction: column; align-items: center; gap: 2px; height: 100%; flex: 0 1 50%; min-width: 0; }
  svg { flex: 1; min-height: 0; width: 100%; display: block; -webkit-user-select: none; user-select: none; }
  .mind { position: absolute; left: 50%; top: 0; transform: translateX(-50%); width: 20%; max-width: 80px; }
  .label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-3); flex: none; }
</style>
