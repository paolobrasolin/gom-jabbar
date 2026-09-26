/// <reference types="node" />
import { readFileSync } from 'node:fs'

/** The app's global stylesheet, as `main.ts` loads it: jsdom cascades it, so a test can catch a global rule leaking into a component. Component styles are not injected under tests (and Vitest empties `?raw` CSS imports, hence the file read). */
export function loadAppCss(): void {
  if (document.getElementById('app-css')) return
  const style = document.createElement('style')
  style.id = 'app-css'
  style.textContent = readFileSync('src/app.css', 'utf8')
  document.head.appendChild(style)
}
