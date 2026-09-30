<script lang="ts">
  import Sheet from './Sheet.svelte'
  import EntryForm from './EntryForm.svelte'
  import PresetForm, { type PresetSeed } from './PresetForm.svelte'
  import { t } from '../i18n/index.svelte'
  import { draftFromEntry, draftToInput, emptyDraft, type EntryDraft } from '../lib/draft'
  import { editEntry, deleteEntry, restoreEntries, isUpdate, isHead, loadEpisode, timeProblem, type TimeProblem } from '../lib/entries'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import { failed } from '../lib/failure'
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

  let form = $state<EntryForm>()
  /** What is wrong with the times as edited: an update is bounded by its head, a head by its first update. */
  async function timesOf(e: Entry, input: { at?: string; kind?: string; endedAt?: string | null }): Promise<TimeProblem | null> {
    const at = input.at!
    if (isUpdate(e)) {
      const head = await loadEpisode(e.episodeId!)
      return timeProblem({ at }, { notBefore: head?.head.at })
    }
    const ep = isHead(e) ? await loadEpisode(e.id) : undefined
    const endedAt = lock === 'kind' || input.kind === 'episode' ? input.endedAt : null
    return timeProblem({ at, endedAt }, { notAfter: ep?.updates[0]?.at })
  }

  /** A save in flight: the second tap of a double tap does nothing. */
  let busy = false
  async function save() {
    if (!editing || busy) return
    busy = true
    const input = draftToInput(draft)
    // A reading stays inside its episode and an end after its start (§5.5): otherwise say so and show the row.
    const problem = await timesOf(editing, input)
    if (problem) {
      busy = false
      showToast(t(problem === 'end-before-start' ? 'time.endBeforeStart' : problem === 'before-start' ? 'time.beforeStart' : 'time.afterUpdate'))
      void form?.pointAt(problem === 'end-before-start' ? 'end' : 'start')
      return
    }
    const patch: Partial<Entry> = { at: input.at!, layers: input.layers as Layer[], note: input.note! }
    if (lock === 'none') {
      // The kind may change: an episode is its own head with an end; a chronic snapshot has neither.
      patch.kind = input.kind
      patch.episodeId = input.kind === 'episode' ? editing.id : undefined
      patch.endedAt = input.kind === 'episode' ? input.endedAt : undefined
    } else if (lock === 'kind') {
      patch.endedAt = input.endedAt
    }
    let before
    try {
      ;({ before } = await editEntry(editing.id, patch))
    } catch (e) {
      return failed(e)
    } finally {
      busy = false
    }
    haptic(20)
    open = false
    // An edit is undone like any other change: the row goes back exactly as it was.
    showToast(t('log.saved'), before && { label: t('log.undo'), run: () => void restoreEntries([before]).catch(failed) })
  }

  /** Deleting a head takes its updates along; the toast brings them all back. */
  async function remove() {
    if (!editing) return
    let gone
    try {
      gone = await deleteEntry(editing.id)
    } catch (e) {
      return failed(e)
    }
    open = false
    haptic(20)
    if (gone.length) showToast(t('diary.deleted'), { label: t('log.undo'), run: () => void restoreEntries(gone).catch(failed) })
  }
</script>

<Sheet bind:open title={t('diary.edit')} tall>
  <EntryForm bind:this={form} bind:draft {symptoms} {tags} {lock}>
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
