<script lang="ts">
  import { t, tl } from '../i18n/index.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { addSymptom, addTag, rename, setEnabled, move } from '../lib/vocab'
  import { PAIN, type Symptom, type Tag, type TagGroup } from '../lib/types'
  import { haptic } from '../lib/toast.svelte'

  let { table }: { table: 'symptoms' | 'tags' } = $props()

  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const groups: TagGroup[] = ['intervention', 'context', 'medication']

  const sections = $derived.by((): { key: string; title: string; items: (Symptom | Tag)[] }[] =>
    table === 'symptoms'
      ? [{ key: 'symptoms', title: '', items: symptoms.value }]
      : groups.map((g) => ({ key: g, title: t(`tag.group.${g}`), items: tags.value.filter((x) => x.group === g) })),
  )

  let editingId = $state<string | null>(null)
  let editText = $state('')
  let newText = $state<Record<string, string>>({})

  function startEdit(item: Symptom | Tag) {
    editingId = item.id
    editText = tl(item.label)
  }
  async function commitEdit() {
    if (editingId && editText.trim()) await rename(table, editingId, prefs.lang, editText.trim())
    editingId = null
  }
  async function add(key: string) {
    const text = (newText[key] ?? '').trim()
    if (!text) return
    if (table === 'symptoms') await addSymptom(text)
    else await addTag(text, key as TagGroup)
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
          <div class="item" class:off={!item.enabled}>
            {#if table === 'symptoms' && item.id === PAIN}
              <span class="lock" aria-hidden="true"></span>
            {:else}
              <label class="switch">
                <input type="checkbox" checked={item.enabled} onchange={(e) => setEnabled(table, item.id, (e.target as HTMLInputElement).checked)} aria-label={tl(item.label)} />
                <span class="knob"></span>
              </label>
            {/if}
            {#if editingId === item.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input class="grow rename" type="text" bind:value={editText} onblur={commitEdit} onkeydown={(e) => e.key === 'Enter' && commitEdit()} autofocus />
            {:else}
              <button class="grow name" onclick={() => startEdit(item)}>{tl(item.label)}</button>
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
  .item.off .name { color: var(--ink-3); text-decoration: line-through; }
  .lock { width: 46px; flex: none; }
  .switch { min-height: 0; }
  .name { text-align: left; min-height: 44px; padding: 0 6px; border-radius: 8px; }
  .name:active { background: var(--surface-2); }
  .rename, .add input { min-height: 44px; padding: 0 10px; border-radius: 8px; border: 1.5px solid var(--border); background: var(--surface); }
  .arrow { width: 40px; min-height: 40px; border-radius: 8px; background: var(--surface-2); font-size: 16px; }
  .add { padding-top: 4px; }
</style>
