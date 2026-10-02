<script lang="ts">
  import { t, tl } from '../i18n/index.svelte'
  import { regionText as rt, headline, isRead, symptomName } from '../lib/summary'
  import { mergedTags, type Layer } from '../lib/layers'
  import { leadSymptom } from '../lib/vocabulary'
  import type { Symptom, Tag } from '../lib/types'

  /**
   * `lead` goes first, e.g. the headline symptom name when it is not pain. Several layers each show their level; the tags
   * are the union. `where: false` leaves the regions out (a row named after its preset, §6.2). `after` goes between the
   * regions and the tags, so with no region a tag does not sit where the place goes ("da 3h" in the in-corso menu).
   * `symptoms` names each layer's number when it is not the lead symptom's, "mente 6 ansia" (#114).
   */
  let { lead = '', layers, tagDefs = [], where = true, after = '', symptoms = [] }: { lead?: string; layers: Layer[]; tagDefs?: Tag[]; where?: boolean; after?: string; symptoms?: Symptom[] } = $props()

  const regionText = (regions: string[]) => rt(regions, t)
  /** A layer's level on a row of several: its headline, named when it is not the lead symptom's. */
  function level(l: Layer): string {
    const h = headline(l.readings, leadSymptom(symptoms))
    const name = symptoms.length ? symptomName(h.id, symptoms, tl) : ''
    return name ? `${h.value} ${name}` : `${h.value}`
  }
  const parts = $derived([
    ...(lead ? [lead] : []),
    ...(where ? layers.filter((l) => l.regions.length).map((l) => (layers.length > 1 && isRead([l]) ? `${regionText(l.regions)} ${level(l)}` : regionText(l.regions))) : []),
    ...(after ? [after] : []),
  ])
  const tagText = $derived(
    mergedTags(layers)
      .map((id) => tagDefs.find((d) => d.id === id))
      .filter((d): d is Tag => !!d)
      .map((d) => tl(d.label))
      .join(' · '),
  )
</script>

<span class="regions">{parts.join(' · ')}</span>{#if tagText}<span class="tags">{parts.length ? ' · ' : ''}{tagText}</span>{/if}

<style>
  .tags { color: var(--ink-2); }
</style>
