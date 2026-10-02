import { ICONS } from './icons'
import { t } from '../i18n/index.svelte'
import { NewerDatabaseError } from './db'
import { downloadRaw } from './raw'

const SVG = 'http://www.w3.org/2000/svg'

/** The button of the startup error: what it runs may return a line that replaces the message (what came of it). */
export type StartupAction = { label: string; run: () => Promise<string | void> }

/**
 * The storage error at startup (§4.1): the database would not open, so the app may never draw. Built by hand in the
 * look of every other failure (#94, §10), over the page, once.
 */
export function showStartupError(text: string, action?: StartupAction): HTMLElement {
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
  if (action) {
    const button = document.createElement('button')
    button.className = 'btn small'
    button.textContent = action.label
    button.onclick = async () => {
      button.disabled = true
      const said = await action.run()
      if (said) span.textContent = said
      button.disabled = false
    }
    box.append(button)
  }
  document.body.appendChild(box)
  return box
}

/**
 * The database did not open at startup (§4.1). A newer release left it: no failure, the app says so itself. Anything
 * else: the data is still on the phone, and **Scarica i dati grezzi** hands every table over as a file (`lib/raw.ts`),
 * whatever kept Dexie from opening it.
 */
export function startupFailed(err: unknown, name?: string): void {
  console.error(err)
  if (err instanceof NewerDatabaseError) return
  showStartupError(t('app.dbError'), {
    label: t('app.raw'),
    run: async () => {
      try {
        if (!(await downloadRaw(name))) return t('app.rawNone')
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        console.error(e)
        return t('app.rawFailed')
      }
    },
  })
}
