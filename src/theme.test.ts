import { describe, it, expect } from 'vitest'
/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { contrast } from './test/contrast'

/** The custom properties of the first block whose selector is `selector`, as written in app.css. */
function tokens(css: string, selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`)
  if (at < 0) throw new Error(`no block ${selector}`)
  const body = css.slice(at, css.indexOf('}', at))
  return Object.fromEntries(Array.from(body.matchAll(/(--[\w-]+):\s*([^;]+);/g), (m) => [m[1], m[2].trim()]))
}

// Read from disk: Vitest empties `?raw` CSS imports.
const css = readFileSync('src/app.css', 'utf8')
const light = tokens(css, ':root')
const darkAuto = tokens(css, ":root:not([data-theme='light'])")
const dark = tokens(css, ":root[data-theme='dark']")

/** Text over a background, 4.5:1 (§10). The toast is inverted: its background is --ink. */
const TEXT: [string, string][] = [
  ...['--ink', '--ink-2', '--accent', '--danger'].flatMap((fg) => ['--bg', '--surface', '--surface-2'].map((bg): [string, string] => [fg, bg])),
  ['--accent-ink', '--accent'],
  ['--bg', '--ink'],
  ['--toast-action', '--ink'],
  // A refusal and a failure each have their own colours (#94).
  ['--warn-ink', '--warn-bg'],
  ['--fail-ink', '--fail-bg'],
]

describe('theme tokens', () => {
  it('writes the dark theme once: the automatic and the chosen blocks agree', () => {
    expect(darkAuto).toEqual(dark)
  })

  for (const [name, theme] of [['light', light], ['dark', { ...light, ...dark }]] as const) {
    it(`keeps every text colour at 4.5:1 or better on its backgrounds, ${name}`, () => {
      const low = TEXT.map(([fg, bg]) => ({ fg, bg, ratio: +contrast(theme[fg], theme[bg]).toFixed(2) })).filter((p) => p.ratio < 4.5)
      expect(low).toEqual([])
    })
  }

  it('never writes text in --ink-3, the grey for lines and handles only', () => {
    const files = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => /\.(svelte|css)$/.test(f))
    expect(files.length).toBeGreaterThan(20)
    const hits = files.flatMap((f) =>
      readFileSync(join('src', f), 'utf8')
        .split('\n')
        .map((line, i) => ({ at: `${f}:${i + 1}`, line }))
        .filter(({ line }) => /(^|[\s;{])(color|fill):\s*var\(--ink-3\)/.test(line)),
    )
    expect(hits.map((h) => h.at)).toEqual([])
  })
})
