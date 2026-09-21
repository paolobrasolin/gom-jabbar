<script lang="ts">
  import Sheet from './Sheet.svelte'
  import EntryForm from './EntryForm.svelte'
  import { t } from '../i18n/index.svelte'
  import { draftFromEntry, draftToInput, emptyDraft, type EntryDraft } from '../lib/draft'
  import { updateEntry, deleteEntry, restoreEntries, isUpdate, isHead, loadEpisode } from '../lib/entries'
  import { addPreset, presetFromDraft } from '../lib/presets'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import type { Entry, Layer, Symptom, Tag } from '../lib/types'

  let { entry = $bindable(null), symptoms = [], tags = [] }: { entry: Entry | null; symptoms?: Symptom[]; tags?: Tag[] } = $props()

  let draft = $state<EntryDraft>(emptyDraft())
  let open = $state(false)
  let editing: Entry | null = null
  /** What the form may not change (§5.5): an update is a reading of its episode; a head with updates stays an episode. */
  let lock = $state<'none' | 'kind' | 'reading'>('none')
  let naming = $state(false)
  let presetName = $state('')

  $effect(() => {
    if (entry) {
      dismissToast()
      editing = entry
      draft = draftFromEntry(entry)
      lock = isUpdate(entry) ? 'reading' : 'none'
      naming = false
      presetName = ''
      open = true
      if (isHead(entry)) void loadEpisode(entry.id).then((ep) => { if (ep?.updates.length && editing === entry) lock = 'kind' })
    }
  })

  /** The entry as it stands in the form becomes a preset (§5.6); the sheet stays open, edits are untouched. */
  async function createPreset() {
    const name = presetName.trim()
    if (!name) return
    await addPreset(presetFromDraft(draft, name))
    presetName = ''
    naming = false
    haptic(20)
    showToast(t('preset.created'))
  }
  function focus(el: HTMLInputElement) {
    el.focus()
  }
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

<Sheet bind:open title={t('diary.edit')}>
  <EntryForm bind:draft {symptoms} {tags} {lock} />
  <div class="row">
    <button class="btn danger" onclick={remove}>{t('diary.delete')}</button>
    <button class="btn primary grow" onclick={save}>{t('common.save')}</button>
  </div>
  {#if lock !== 'reading'}
    <div class="preset">
      {#if naming}
        <div class="row">
          <input class="grow" type="text" placeholder={t('preset.name')} aria-label={t('preset.name')} bind:value={presetName} use:focus onkeydown={(e) => e.key === 'Enter' && createPreset()} />
          <button class="chip small" disabled={!presetName.trim()} onclick={createPreset}>{t('preset.create')}</button>
        </div>
        <p class="small muted">{t('preset.hint')}</p>
      {:else}
        <button class="chip small outline" onclick={() => (naming = true)}>{t('preset.fromEntry')}</button>
      {/if}
    </div>
  {/if}
</Sheet>

<style>
  .preset { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; padding-top: 4px; }
  .preset .row { align-self: stretch; }
  .preset input { min-height: 44px; padding: 0 10px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); min-width: 0; }
  .preset .chip:disabled { opacity: 0.4; }
</style>
