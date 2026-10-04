<script module lang="ts">
  import { t, locale } from '../i18n/index.svelte'
  import { toLocalInput, fromLocalInput, thisMorning, lastNight, hoursAgo, formatTime, formatDay } from '../lib/time'

  type Choice = { key: string; label: string; iso: () => string | null }
  /** The chips a row offers, without its `none`: relative times, and the two named moments of the day when `day`. */
  function offered(day: boolean): Choice[] {
    return [
      { key: 'h1', label: t('time.hoursAgo', { n: 1 }), iso: () => hoursAgo(1).toISOString() },
      { key: 'h3', label: t('time.hoursAgo', { n: 3 }), iso: () => hoursAgo(3).toISOString() },
      ...(day
        ? [
            // Before 08:00, this morning at 08:00 is still to come: not offered.
            ...(new Date().getHours() >= 8 ? [{ key: 'morning', label: t('time.thisMorning'), iso: () => thisMorning().toISOString() }] : []),
            { key: 'night', label: t('time.lastNight'), iso: () => lastNight().toISOString() },
          ]
        : []),
    ]
  }
  /** The chip a value matches, within a minute of what it would set now, else the day and the time: how the row shows it, for showing it elsewhere (#22). */
  export function timeLabel(value: string, day = true): string {
    const m = offered(day).find((c) => Math.abs(Date.parse(c.iso()!) - Date.parse(value)) < 60_000)
    return m?.label ?? `${formatDay(value, locale(), { today: t('diary.today'), yesterday: t('diary.yesterday') })} ${formatTime(value, locale())}`
  }

  /**
   * Scrolls a row sideways just enough to show its pressed chip: an old entry's time is the last chip, and with it
   * off to the right "Adesso" was the only one in sight, one tap from moving the entry to now.
   */
  export function revealPressed(row: HTMLElement | undefined): void {
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!row || !chip) return
    const r = row.getBoundingClientRect()
    const c = chip.getBoundingClientRect()
    // The row's own padding, so the chip does not sit flush against the edge.
    const pad = 12
    // A chip wider than the row (a layer tab with a long summary, #115) shows from its start, where its words begin.
    if (c.width > r.width - 2 * pad) row.scrollLeft += c.left - r.left - pad
    else if (c.right > r.right) row.scrollLeft += c.right - r.right + pad
    else if (c.left < r.left) row.scrollLeft -= r.left - c.left + pad
  }
</script>

<script lang="ts">
  import { tick } from 'svelte'

  /**
   * One row of chips that picks a time (§6.1): `none` is the chip for `null`, "Adesso" for a time resolved at save or
   * "In corso" for an end not yet reached. When null does not mean now, an "Adesso" chip sets the moment it is pressed.
   * `label` names the row for assistive tech; `caption` shows it. `shown`: whether the row is on screen now (a drawer
   * opening), so the pressed chip is brought into view when it can be measured. `onnow` hears the moment an "Adesso"
   * chip set.
   */
  let {
    value = $bindable(),
    label,
    caption = '',
    none,
    nullIsNow = true,
    day = true,
    shown = true,
    onnow,
  }: { value: string | null; label: string; caption?: string; none: string; nullIsNow?: boolean; day?: boolean; shown?: boolean; onnow?: (iso: string) => void } = $props()

  let picking = $state(false)
  let row = $state<HTMLElement>()
  let input = $state<HTMLInputElement>()
  const choices = $derived.by((): Choice[] => [
    { key: 'none', label: none, iso: () => null },
    ...(nullIsNow ? [] : [{ key: 'now', label: t('time.now'), iso: () => new Date().toISOString() }]),
    ...offered(day),
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
    picking = false
  })
  // The pressed chip in sight whenever the row shows or the choice changes.
  $effect(() => {
    void active
    if (shown) void tick().then(() => revealPressed(row))
  })

  /**
   * "Scegli…": the field lands below the fold, under the Salva bar, where nothing seemed to happen. Scroll it into
   * the form's own view and, where the browser can, open its picker straight away (Chrome; jsdom and old Safari cannot).
   */
  async function pick() {
    picking = !picking
    if (!picking) return
    await tick()
    input?.scrollIntoView?.({ block: 'nearest' })
    try {
      input?.showPicker?.()
    } catch {
      /* not allowed here: the field is in view, a tap opens it */
    }
  }
</script>

<div class="chips time" role="group" aria-label={label} bind:this={row}>
  {#if caption}<span class="caption">{caption}</span>{/if}
  {#each choices as c (c.key)}
    <button class="chip small" aria-pressed={active === c.key} onclick={() => {
      value = c.iso()
      if (c.key === 'now' && value) onnow?.(value)
    }}>{c.label}</button>
  {/each}
  <button class="chip small" aria-pressed={active === 'custom'} onclick={pick}>
    {active === 'custom' ? customLabel : t('time.pick')}
  </button>
</div>
{#if picking}
  <input bind:this={input} type="datetime-local" max={toLocalInput(new Date().toISOString())} value={toLocalInput(value ?? new Date().toISOString())} onchange={(e) => (value = fromLocalInput((e.target as HTMLInputElement).value) ?? value)} />
{/if}

<style>
  .time { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -12px; padding: 2px 12px; align-items: center; }
  .time::-webkit-scrollbar { display: none; }
  /* Same style as the slider labels: a field label, not a section marker. */
  .caption { flex: none; font-size: 13px; font-weight: 600; color: var(--ink-2); padding: 0 2px; }
</style>
