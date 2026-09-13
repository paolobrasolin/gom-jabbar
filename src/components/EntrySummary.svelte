<script lang="ts">
  import { t, tl } from '../i18n/index.svelte'
  import { regionText as rt } from '../lib/summary'
  import type { Area } from '../lib/areas'
  import type { Tag } from '../lib/types'

  let { areas, tags = [], tagDefs = [] }: { areas: Area[]; tags?: string[]; tagDefs?: Tag[] } = $props()

  const regionText = (regions: string[]) => rt(regions, t)
  const parts = $derived(areas.filter((a) => a.regions.length).map((a) => (areas.length > 1 ? `${regionText(a.regions)} ${a.intensity}` : regionText(a.regions))))
  const tagText = $derived(
    tags
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
