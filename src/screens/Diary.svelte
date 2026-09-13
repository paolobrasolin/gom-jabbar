<script lang="ts">
  import Sheet from '../components/Sheet.svelte'
  import EntryForm from '../components/EntryForm.svelte'
  import EntrySummary from '../components/EntrySummary.svelte'
  import { t, locale } from '../i18n/index.svelte'
  import { db } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { prefs } from '../lib/prefs.svelte'
  import { draftFromEntry, draftToInput, type EntryDraft } from '../lib/draft'
  import { updateEntry, deleteEntry, restoreEntry, durationMs } from '../lib/entries'
  import { showToast, haptic, dismissToast } from '../lib/toast.svelte'
  import { intensityColor, intensityInk } from '../lib/color'
  import { dayKey, formatDay, formatTime, formatDuration } from '../lib/time'
  import { PAIN, type Entry } from '../lib/types'

  let days = $state(30)
  const cutoff = $derived(new Date(Date.now() - days * 86_400_000).toISOString())
  const entries = live(() => days, () => db.entries.where('at').aboveOrEqual(cutoff).reverse().toArray(), [])
  const total = live(() => null, () => db.entries.count(), 0)
  const tags = live(() => null, () => db.tags.orderBy('order').toArray(), [])
  const symptoms = live(() => null, () => db.symptoms.orderBy('order').toArray(), [])

  const groups = $derived.by(() => {
    const out: { key: string; label: string; items: Entry[] }[] = []
    for (const e of entries.value) {
      const key = dayKey(e.at)
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        g = { key, label: formatDay(e.at, locale(), { today: t('diary.today'), yesterday: t('diary.yesterday') }), items: [] }
        out.push(g)
      }
      g.items.push(e)
    }
    return out
  })
  const units = $derived({ d: prefs.lang === 'en' ? 'd' : 'g', h: 'h', m: 'm' })

  let editing = $state<Entry | null>(null)
  let draft = $state<EntryDraft>(draftFromEntry({ readings: {}, areas: [], tags: [], note: '', at: '', endedAt: null, ongoing: false, id: '', createdAt: '', updatedAt: '' }))
  let open = $state(false)

  function edit(e: Entry) {
    dismissToast()
    editing = e
    draft = draftFromEntry(e)
    open = true
  }

  async function save() {
    if (!editing) return
    const input = draftToInput(draft)
    const wasOngoing = editing.ongoing
    const patch: Partial<Entry> = { ...input, readings: input.readings!, areas: input.areas!, tags: input.tags!, note: input.note!, at: input.at!, ongoing: input.ongoing! }
    if (wasOngoing && !input.ongoing) patch.endedAt = new Date().toISOString()
    if (!wasOngoing && input.ongoing) patch.endedAt = null
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

<div class="screen">
  {#if total.value === 0}
    <div class="empty">
      <p>{t('diary.empty')}</p>
      <p class="muted small">{t('diary.emptyHint')}</p>
    </div>
  {:else}
    {#each groups as g (g.key)}
      <section>
        <h2 class="day">{g.label}</h2>
        <div class="list">
          {#each g.items as e (e.id)}
            {@const pain = e.readings[PAIN] ?? 0}
            {@const dur = durationMs(e)}
            <button class="entry card row" onclick={() => edit(e)}>
              <span class="time muted small">{formatTime(e.at, locale())}</span>
              <span class="pill" style="background: {intensityColor(pain)}; color: {intensityInk(pain)}">{pain}</span>
              <span class="grow body">
                <span class="line"><EntrySummary areas={e.areas} tags={e.tags} tagDefs={tags.value} /></span>
                {#if dur !== null}
                  <span class="small muted">{e.ongoing ? t('diary.ongoing') : formatDuration(dur, units)}</span>
                {/if}
                {#if e.note}<span class="small muted note">{e.note}</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
    {#if entries.value.length < total.value}
      <button class="btn" onclick={() => (days += 60)}>…</button>
    {/if}
  {/if}
</div>

<Sheet bind:open title={t('diary.edit')}>
  <EntryForm bind:draft symptoms={symptoms.value} tags={tags.value} detailsOpen={true} />
  <div class="row">
    <button class="btn danger" onclick={remove}>{t('diary.delete')}</button>
    <button class="btn primary grow" onclick={save}>{t('common.save')}</button>
  </div>
</Sheet>

<style>
  .empty { text-align: center; padding: 48px 0; }
  .day { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-2); margin: 6px 0 8px; }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .entry { width: 100%; text-align: left; padding: 10px 12px; }
  .time { width: 44px; flex: none; font-variant-numeric: tabular-nums; }
  .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
