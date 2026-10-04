<script lang="ts">
  import { t, tl, tn } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { addSymptom, addTag, rename, setEnabled, move, usage, deleteItem, restoreItem, type Usage } from '../lib/vocab'
  import type { Symptom, SymptomCategory, Tag, TagGroup } from '../lib/types'
  import { isMindSymptom } from '../lib/vocabulary'
  import { ICONS } from '../lib/icons'
  import { showRefusal, haptic, showToast } from '../lib/toast.svelte'
  import { failed } from '../lib/failure'

  let { table }: { table: 'symptoms' | 'tags' } = $props()

  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  /** How much each item is used (§6.4): a used one says so and can only be switched off, an unused one can go. */
  const used = live(() => null, async () => usage(await db.entries.toArray(), await db.presets.toArray()), new Map<string, Usage>())
  const groups: TagGroup[] = ['intervention', 'context', 'medication']
  const categories: SymptomCategory[] = ['body', 'mind']

  const sections = $derived.by((): { key: string; title: string; items: (Symptom | Tag)[] }[] =>
    table === 'symptoms'
      ? categories.map((c) => ({ key: c, title: t(`symptom.group.${c}`), items: symptoms.value.filter((s) => isMindSymptom(s) === (c === 'mind')) }))
      : groups.map((g) => ({ key: g, title: t(`tag.group.${g}`), items: tags.value.filter((x) => x.group === g) })),
  )

  let editingId = $state<string | null>(null)
  let editText = $state('')
  /** The name as the field opened with it: left unchanged, it is no rename (a seed name would stop following the language). */
  let shown = ''
  let newText = $state<Record<string, string>>({})

  function startEdit(item: Symptom | Tag) {
    editingId = item.id
    editText = shown = tl(item.label)
  }
  /**
   * Another item of the list already called `text`, in the language shown, whatever the case (§5.2): two items with
   * one name would be two identical sliders or chips. Says so (a refusal).
   */
  function taken(text: string, except?: string): boolean {
    const name = text.trim().toLocaleLowerCase()
    const other = (table === 'symptoms' ? symptoms.value : tags.value).find((x) => x.id !== except && tl(x.label).trim().toLocaleLowerCase() === name)
    if (other) showRefusal(t('vocab.exists', { name: tl(other.label) }))
    return !!other
  }
  async function commitEdit() {
    if (editingId && editText.trim() !== shown && !taken(editText, editingId)) await rename(table, editingId, editText)
    editingId = null
  }
  function usageText(u: Usage): string {
    const parts = []
    if (u.entries) parts.push(tn('vocab.entries', u.entries))
    if (u.presets) parts.push(tn('vocab.presets', u.presets))
    return parts.join(' · ')
  }
  /** Elimina (§6.4): no dialog, an undo toast that puts the item back as it was. */
  async function remove(item: Symptom | Tag) {
    const name = tl(item.label)
    // The field it was deleted from closes: undo brings the item back as a row, not mid-rename.
    editingId = null
    const gone = await deleteItem(table, item.id)
    if (!gone) return
    haptic(20)
    showToast(t('vocab.deleted', { name }), { label: t('log.undo'), run: () => void restoreItem(table, gone).catch(failed) })
  }
  /** An add in flight: the second tap of a double tap would add the item twice. */
  let adding = false
  async function add(key: string) {
    const text = (newText[key] ?? '').trim()
    if (!text || adding || taken(text)) return
    adding = true
    try {
      if (table === 'symptoms') await addSymptom(text, key as SymptomCategory)
      else await addTag(text, key as TagGroup)
    } finally {
      adding = false
    }
    newText = { ...newText, [key]: '' }
    haptic(15)
  }
</script>

<div class="editor">
  {#each sections as sec (sec.key)}
    <section>
      {#if sec.title}<p class="small muted group-title">{sec.title}</p>{/if}
      <div class="list">
        {#each sec.items as item (item.id)}
          {@const u = used.value.get(item.id)}
          <div class="item" class:off={!item.enabled}>
            <label class="switch">
              <input type="checkbox" checked={item.enabled} onchange={(e) => setEnabled(table, item.id, (e.target as HTMLInputElement).checked)} aria-label={tl(item.label)} />
              <span class="knob"></span>
            </label>
            {#if editingId === item.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input class="grow rename" type="text" bind:value={editText} onblur={commitEdit} onkeydown={(e) => e.key === 'Enter' && commitEdit()} autofocus />
              <!-- Deleting is rare (#115): it lives here, beside the name being edited, for an item nothing uses. Pressing it keeps the field's focus, so its blur does not close the field first. -->
              {#if !u}
                <button class="square" aria-label={t('vocab.delete', { name: tl(item.label) })} onpointerdown={(e) => e.preventDefault()} onclick={() => remove(item)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    {#each ICONS.clear as d, i (i)}<path {d} />{/each}
                  </svg>
                </button>
              {/if}
            {:else}
              <div class="grow who">
                <button class="name" onclick={() => startEdit(item)}>{tl(item.label)}</button>
                {#if u}<span class="small muted use">{usageText(u)}</span>{/if}
              </div>
              <!-- Renaming says so (#115): a name alone read as plain text. -->
              <button class="square" aria-label={t('vocab.rename', { name: tl(item.label) })} onclick={() => startEdit(item)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></svg>
              </button>
            {/if}
            <button class="arrow" aria-label="↑" onclick={() => move(table, item.id, -1)}>↑</button>
            <button class="arrow" aria-label="↓" onclick={() => move(table, item.id, 1)}>↓</button>
          </div>
        {/each}
        <div class="item add">
          <input
            class="grow"
            type="text"
            placeholder={t('vocab.addPlaceholder')}
            value={newText[sec.key] ?? ''}
            oninput={(e) => (newText = { ...newText, [sec.key]: (e.target as HTMLInputElement).value })}
            onkeydown={(e) => e.key === 'Enter' && add(sec.key)} />
          <button class="chip small" onclick={() => add(sec.key)}>+ {t('vocab.add')}</button>
        </div>
      </div>
    </section>
  {/each}
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 16px; }
  .group-title { margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 12px; }
  .list { display: flex; flex-direction: column; gap: 4px; }
  .item { display: flex; align-items: center; gap: 8px; min-height: 48px; }
  .item.off .name { color: var(--ink-2); text-decoration: line-through; }
  /* The name, its usage under it: the row keeps its width for the buttons. */
  .who { display: flex; flex-direction: column; justify-content: center; min-width: 0; min-height: 44px; }
  .name { text-align: left; padding: 2px 6px; border-radius: 8px; overflow-wrap: anywhere; }
  .name:active { background: var(--surface-2); }
  .rename, .add input { min-height: 44px; padding: 0 10px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); }
  .use { padding: 0 6px; line-height: 1.2; }
  /* ✎ and the bin, the same squares as ↑ and ↓ (#115). */
  .square { width: 44px; min-height: 44px; flex: none; border-radius: 8px; background: var(--surface-2); display: grid; place-items: center; }
  .square svg { width: 20px; height: 20px; }
  .square:active, .arrow:active { filter: brightness(0.94); }
  .arrow { width: 44px; min-height: 44px; border-radius: 8px; background: var(--surface-2); font-size: 16px; }
  .add { padding-top: 4px; }
</style>
