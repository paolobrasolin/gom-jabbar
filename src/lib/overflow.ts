/**
 * Marks which ends of a scrolling row hide content, as `data-more` ("start", "end", both or empty), so CSS can fade them
 * (`.fade-x`, `.fade-y` in app.css): a row cut at its edge then says it goes on (#115). Kept up to date on scroll, on a
 * resize and when the row's children change. A Svelte action: `use:overflowFade` or `use:overflowFade={'y'}`.
 */
export function overflowFade(node: HTMLElement, axis: 'x' | 'y' = 'x') {
  const update = () => {
    const [pos, size, view] = axis === 'x' ? [node.scrollLeft, node.scrollWidth, node.clientWidth] : [node.scrollTop, node.scrollHeight, node.clientHeight]
    node.dataset.more = [pos > 1 ? 'start' : '', pos + view < size - 1 ? 'end' : ''].filter(Boolean).join(' ')
  }
  update()
  node.addEventListener('scroll', update, { passive: true })
  const resized = new ResizeObserver(update)
  resized.observe(node)
  const changed = new MutationObserver(update)
  changed.observe(node, { childList: true, subtree: true, characterData: true })
  return {
    destroy() {
      node.removeEventListener('scroll', update)
      resized.disconnect()
      changed.disconnect()
    },
  }
}
