<script lang="ts">
  import { tick, type Snippet } from 'svelte'

  /**
   * A button that drops a menu under itself (#37): the log's top row is three of them, the screens, the episodes going
   * on and the presets. `end` puts it at the right edge of its row, its menu aligned to its right. `items` gets `close`;
   * an item calls it before acting.
   */
  let {
    label,
    cls = '',
    style = '',
    end = false,
    trigger,
    items,
  }: { label: string; cls?: string; style?: string; end?: boolean; trigger: Snippet; items: Snippet<[() => void]> } = $props()

  const id = `menu-${Math.random().toString(36).slice(2)}`
  let open = $state(false)
  let button = $state<HTMLButtonElement | undefined>()
  let list = $state<HTMLDivElement | undefined>()

  async function toggle() {
    open = !open
    if (!open) return
    await tick()
    keepInside(list!)
    list!.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }
  /** A menu hanging from a button mid-row can outgrow the screen on a narrow (zoomed) page: slide it back inside, 12px from either edge. */
  function keepInside(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    if (!r.width) return
    let dx = Math.min(0, innerWidth - 12 - r.right)
    if (r.left + dx < 12) dx = 12 - r.left
    if (dx) el.style.translate = `${dx}px 0`
  }
  function close(refocus = false) {
    open = false
    if (refocus) button!.focus()
  }
  /** A tap anywhere else closes it, another dropdown's button included; its own button toggles. */
  function outside(e: PointerEvent) {
    const at = e.target as Node
    if (open && !list!.contains(at) && !button!.contains(at)) close()
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close(true)
  }
</script>

<svelte:window onpointerdown={outside} />

<div class="dd-wrap" class:end>
  <button bind:this={button} class="chip small dd {cls}" {style} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onclick={toggle}>
    {@render trigger()}
  </button>
  {#if open}
    <div bind:this={list} {id} class="menu" class:end role="menu" aria-label={label} tabindex="-1" onkeydown={onKey}>
      {@render items(() => close())}
    </div>
  {/if}
</div>

<style>
  .dd-wrap { position: relative; min-width: 0; max-width: 100%; display: flex; }
  .dd-wrap.end { margin-left: auto; }
  .dd { flex: none; min-width: 0; max-width: 100%; }
  .menu {
    position: absolute; top: calc(100% + 4px); left: 0; z-index: 30;
    /* Its content's width, not its button's: the wrapper it hangs from is only as wide as the button. */
    width: max-content; min-width: min(220px, calc(100vw - 24px)); max-width: calc(100vw - 24px);
    display: flex; flex-direction: column;
    padding: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow);
  }
  .menu.end { left: auto; right: 0; }
  .menu:focus { outline: none; }
  .menu :global([role='menuitem']) {
    min-height: var(--tap);
    display: flex; align-items: center; gap: 12px;
    /* Room above and below a line that wraps (#115); a one-line item keeps its height, the tap target's. */
    padding: 8px 12px;
    border-radius: 10px;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .menu :global([role='menuitem']:active), .menu :global([role='menuitem']:focus-visible) { background: var(--surface-2); outline: none; }
  .menu :global([role='menuitem'] > svg) { flex: none; width: 22px; height: 22px; color: var(--ink-2); }
</style>
