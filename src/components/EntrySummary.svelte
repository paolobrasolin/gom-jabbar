<script lang="ts">
  import { t, tl } from '../i18n/index.svelte'
  import { summarizeRegions } from '../lib/regions'
  import type { Area } from '../lib/areas'
  import type { Tag } from '../lib/types'

  let { areas, tags = [], tagDefs = [] }: { areas: Area[]; tags?: string[]; tagDefs?: Tag[] } = $props()

  function regionText(regions: string[]): string {
    return summarizeRegions(regions)
      .map((s) => {
        if (s.group === 'full') return t('region.full')
        if (s.group === 'head' || s.group === 'torso' || s.group === 'back') return t(`region.${s.group}`)
        return t(`region.${s.group}.${s.side === 'none' ? 'both' : s.side}`)
      })
      .join(', ')
  }
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
