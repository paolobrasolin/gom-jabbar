import { ICONS } from './icons'

const SVG = 'http://www.w3.org/2000/svg'

/**
 * The storage error at startup (§4.1): the database would not open, so the app may never draw. Built by hand in the
 * look of every other failure (#94, §10), over the page, once.
 */
export function showStartupError(text: string): HTMLElement {
  const old = document.querySelector<HTMLElement>('.msg.startup')
  if (old) return old
  const box = document.createElement('div')
  box.className = 'msg failure startup'
  box.setAttribute('role', 'alert')
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'icon')
  svg.setAttribute('data-icon', 'failed')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('viewBox', '0 0 24 24')
  for (const [k, v] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v)
  for (const d of ICONS.failed) {
    const path = document.createElementNS(SVG, 'path')
    path.setAttribute('d', d)
    svg.appendChild(path)
  }
  const span = document.createElement('span')
  span.className = 'grow'
  span.textContent = text
  box.append(svg, span)
  document.body.appendChild(box)
  return box
}
