<script lang="ts">
  import Sheet from './Sheet.svelte'
  import EntryForm from './EntryForm.svelte'
  import PresetForm, { type PresetSeed } from './PresetForm.svelte'
  import { t } from '../i18n/index.svelte'
  import { draftFromEntry, draftToInput, emptyDraft, type EntryDraft } from '../lib/draft'
  import { updateEntry, deleteEntry, restoreEntries, isUpdate, isHead, loadEpisode } from '../lib/entries'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import type { Entry, Layer, Symptom, Tag } from '../lib/types'

  let { entry = $bindable(null), symptoms = [], tags = [] }: { entry: Entry | null; symptoms?: Symptom[]; tags?: Tag[] } = $props()

  let draft = $state<EntryDraft>(emptyDraft())
  let open = $state(false)
  let editing: Entry | null = null
  /** What the form may not change (§5.5): an update is a reading of its episode; a head with updates stays an episode. */
  let lock = $state<'none' | 'kind' | 'reading'>('none')
  /** The entry as it stands in the form, handed to the preset form (§5.6); this sheet stays open and nothing else is saved. */
  let presetSeed = $state.raw<PresetSeed | null>(null)

  $effect(() => {
    if (entry) {
      dismissToast()
      editing = entry
      draft = draftFromEntry(entry)
      lock = isUpdate(entry) ? 'reading' : 'none'
      open = true
      if (isHead(entry)) void loadEpisode(entry.id).then((ep) => { if (ep?.updates.length && editing === entry) lock = 'kind' })
    }
  })

  $effect(() => {
    if (!open) entry = null
  })

  async function save() {
    if (!editing) return
    const input = draftToInput(draft)
    const patch: Partial<Entry> = { at: input.at!, layers: input.layers as Layer[], note: input.note! }
    if (lock === 'none') {
      // The kind may change: an episode is its own head with an end; a chronic snapshot has neither.
      patch.kind = input.kind
      patch.episodeId = input.kind === 'episode' ? editing.id : undefined
      patch.endedAt = input.kind === 'episode' ? input.endedAt : undefined
    } else if (lock === 'kind') {
      patch.endedAt = input.endedAt
    }
    await updateEntry(editing.id, patch)
    haptic(20)
    open = false
    showToast(t('log.saved'))
  }

  /** Deleting a head takes its updates along; the toast brings them all back. */
  async function remove() {
    if (!editing) return
    const gone = await deleteEntry(editing.id)
    open = false
    haptic(20)
    if (gone.length) showToast(t('diary.deleted'), { label: t('log.undo'), run: () => void restoreEntries(gone) })
  }
</script>

<Sheet bind:open title={t('diary.edit')} tall>
  <EntryForm bind:draft {symptoms} {tags} {lock}>
    {#snippet actions()}
      <div class="row">
        <button class="btn danger" onclick={remove}>{t('diary.delete')}</button>
        <button class="btn primary grow" onclick={save}>{t('common.save')}</button>
      </div>
    {/snippet}
    {#snippet more()}
      {#if lock !== 'reading'}
        <div class="preset">
          <button class="chip small outline" onclick={() => (presetSeed = { draft: $state.snapshot(draft) as EntryDraft })}>{t('preset.fromEntry')}</button>
        </div>
      {/if}
    {/snippet}
  </EntryForm>
</Sheet>
<PresetForm bind:seed={presetSeed} {symptoms} />

<style>
  .preset { display: flex; padding-top: 4px; }
</style>
