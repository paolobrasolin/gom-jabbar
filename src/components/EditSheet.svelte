<script lang="ts">
  import Sheet from './Sheet.svelte'
  import EntryForm from './EntryForm.svelte'
  import { t } from '../i18n/index.svelte'
  import { draftFromEntry, draftToInput, emptyDraft, type EntryDraft } from '../lib/draft'
  import { updateEntry, deleteEntry, restoreEntry } from '../lib/entries'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import type { Entry, Symptom, Tag } from '../lib/types'

  let { entry = $bindable(null), symptoms = [], tags = [] }: { entry: Entry | null; symptoms?: Symptom[]; tags?: Tag[] } = $props()

  let draft = $state<EntryDraft>(emptyDraft())
  let open = $state(false)
  let editing: Entry | null = null

  $effect(() => {
    if (entry) {
      dismissToast()
      editing = entry
      draft = draftFromEntry(entry)
      open = true
    }
  })
  $effect(() => {
    if (!open) entry = null
  })

  async function save() {
    if (!editing) return
    const input = draftToInput(draft)
    const patch: Partial<Entry> = { ...input, readings: input.readings!, areas: input.areas!, tags: input.tags!, note: input.note!, at: input.at!, ongoing: input.ongoing! }
    if (editing.ongoing && !input.ongoing) patch.endedAt = new Date().toISOString()
    if (!editing.ongoing && input.ongoing) patch.endedAt = null
    await updateEntry(editing.id, patch)
    haptic(20)
    open = false
    showToast(t('log.saved'))
  }

  async function remove() {
    if (!editing) return
    const gone = await deleteEntry(editing.id)
    open = false
    haptic(20)
    if (gone) showToast(t('diary.deleted'), { label: t('log.undo'), run: () => void restoreEntry(gone) })
  }
</script>

<Sheet bind:open title={t('diary.edit')}>
  <EntryForm bind:draft {symptoms} {tags} detailsOpen={true} />
  <div class="row">
    <button class="btn danger" onclick={remove}>{t('diary.delete')}</button>
    <button class="btn primary grow" onclick={save}>{t('common.save')}</button>
  </div>
</Sheet>
