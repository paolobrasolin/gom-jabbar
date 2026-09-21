<script lang="ts">
  import { t, locale } from '../i18n/index.svelte'
  import { toLocalInput, fromLocalInput, thisMorning, lastNight, hoursAgo, formatTime, formatDay } from '../lib/time'
  import type { Snippet } from 'svelte'

  /**
   * One row of chips that picks a time (§6.1): `none` is the chip for `null`, "Adesso" for a time resolved at save or
   * "In corso" for an end not yet reached. When null does not mean now, an "Adesso" chip sets the moment it is pressed.
   * `label` names the row for assistive tech; `caption` shows it. `lead` renders before the chips.
   */
  let {
    value = $bindable(),
    label,
    caption = '',
    none,
    nullIsNow = true,
    day = true,
    lead,
  }: { value: string | null; label: string; caption?: string; none: string; nullIsNow?: boolean; day?: boolean; lead?: Snippet } = $props()

  let showPicker = $state(false)
  type Choice = { key: string; label: string; iso: () => string | null }
  const choices = $derived.by((): Choice[] => [
    { key: 'none', label: none, iso: () => null },
    ...(nullIsNow ? [] : [{ key: 'now', label: t('time.now'), iso: () => new Date().toISOString() }]),
    { key: 'h1', label: t('time.hoursAgo', { n: 1 }), iso: () => hoursAgo(1).toISOString() },
    { key: 'h3', label: t('time.hoursAgo', { n: 3 }), iso: () => hoursAgo(3).toISOString() },
    ...(day
      ? [
          { key: 'morning', label: t('time.thisMorning'), iso: () => thisMorning().toISOString() },
          { key: 'night', label: t('time.lastNight'), iso: () => lastNight().toISOString() },
        ]
      : []),
  ])
  /** The chip a value matches, within a minute of what it would set now; else the picker chip shows the value. */
  const active = $derived.by(() => {
    if (value === null) return 'none'
    const m = choices.find((c) => c.key !== 'none' && Math.abs(Date.parse(c.iso()!) - Date.parse(value!)) < 60_000)
    return m?.key ?? 'custom'
  })
  const customLabel = $derived(value ? `${formatDay(value, locale(), { today: t('diary.today'), yesterday: t('diary.yesterday') })} ${formatTime(value, locale())}` : '')
  // A new value from outside (another entry to edit) folds the picker.
  $effect(() => {
    void value
    showPicker = false
  })
</script>

<div class="chips time" role="group" aria-label={label}>
  {@render lead?.()}
  {#if caption}<span class="caption">{caption}</span>{/if}
  {#each choices as c (c.key)}
    <button class="chip small" aria-pressed={active === c.key} onclick={() => (value = c.iso())}>{c.label}</button>
  {/each}
  <button class="chip small" aria-pressed={active === 'custom'} onclick={() => (showPicker = !showPicker)}>
    {active === 'custom' ? customLabel : t('time.pick')}
  </button>
</div>
{#if showPicker}
  <input type="datetime-local" value={toLocalInput(value ?? new Date().toISOString())} onchange={(e) => (value = fromLocalInput((e.target as HTMLInputElement).value))} />
{/if}

<style>
  .time { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -12px; padding: 2px 12px; align-items: center; }
  .time::-webkit-scrollbar { display: none; }
  /* Same style as the slider labels: a field label, not a section marker. */
  .caption { flex: none; font-size: 13px; font-weight: 600; color: var(--ink-2); padding: 0 2px; }
</style>
