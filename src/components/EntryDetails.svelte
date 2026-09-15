<script lang="ts">
  import IntensitySlider from './IntensitySlider.svelte'
  import { t, tl } from '../i18n/index.svelte'
  import { PAIN, type Symptom, type Tag, type TagGroup } from '../lib/types'
  import type { EntryDraft } from '../lib/draft'

  let { draft = $bindable(), symptoms = [], tags = [] }: { draft: EntryDraft; symptoms?: Symptom[]; tags?: Tag[] } = $props()

  const otherSymptoms = $derived(symptoms.filter((s) => s.enabled && s.id !== PAIN))
  const groups: TagGroup[] = ['intervention', 'context', 'medication']
  const tagsByGroup = $derived(groups.map((g) => ({ g, items: tags.filter((x) => x.enabled && x.group === g) })).filter((x) => x.items.length))

  function toggleTag(id: string) {
    draft.tags = draft.tags.includes(id) ? draft.tags.filter((x) => x !== id) : [...draft.tags, id]
  }
  function setReading(id: string, v: number) {
    draft.readings = { ...draft.readings, [id]: v }
  }
</script>

<div class="details">
  {#each otherSymptoms as s (s.id)}
    <IntensitySlider compact label={tl(s.label)} value={draft.readings[s.id] ?? 0} onchange={(v) => setReading(s.id, v)} />
  {/each}
  {#each tagsByGroup as { g, items } (g)}
    <div>
      <p class="small muted group-title">{t(`tag.group.${g}`)}</p>
      <div class="chips">
        {#each items as tag (tag.id)}
          <button class="chip small" aria-pressed={draft.tags.includes(tag.id)} onclick={() => toggleTag(tag.id)}>{tl(tag.label)}</button>
        {/each}
      </div>
    </div>
  {/each}
  <textarea rows="2" placeholder={t('log.notePlaceholder')} bind:value={draft.note} aria-label={t('log.note')}></textarea>
</div>

<style>
  .details { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; min-width: 0; }
  .details > * { min-width: 0; }
  .group-title { margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
</style>
