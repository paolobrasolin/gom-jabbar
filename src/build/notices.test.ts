import { describe, it, expect } from 'vitest'
import { packageOf, noticeOf, renderNotices, type Notice } from './notices'

describe('packageOf', () => {
  it('names the package a bundled module comes from', () => {
    expect(packageOf('/repo/node_modules/svelte/src/internal/client/index.js')).toBe('svelte')
    expect(packageOf('/repo/node_modules/@scope/pkg/dist/x.js')).toBe('@scope/pkg')
    expect(packageOf('/repo/node_modules/a/node_modules/b/index.js')).toBe('b')
    expect(packageOf('/repo/node_modules/dexie/dist/dexie.mjs?commonjs-proxy')).toBe('dexie')
    expect(packageOf('C:\\repo\\node_modules\\nanoid\\index.browser.js')).toBe('nanoid')
  })
  it('is null for our own code and virtual modules', () => {
    expect(packageOf('/repo/src/lib/db.ts')).toBeNull()
    expect(packageOf('\0vite/preload-helper')).toBeNull()
  })
})

describe('noticeOf', () => {
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'dexie', version: '4.0.10', license: 'Apache-2.0' }),
    'LICENSE.md': 'Apache License\nVersion 2.0',
  }
  const read = (f: string) => files[f] ?? null

  it('takes the version and licence from package.json and the text from the licence file', () => {
    expect(noticeOf('dexie', read, Object.keys(files))).toEqual({ name: 'dexie', version: '4.0.10', license: 'Apache-2.0', text: 'Apache License\nVersion 2.0' })
  })
  it('finds the licence file under its usual names, whatever the case', () => {
    for (const name of ['LICENSE', 'license', 'LICENCE.txt', 'License.md', 'COPYING']) {
      expect(noticeOf('x', (f) => (f === name ? 'text' : f === 'package.json' ? '{"version":"1.0.0","license":"MIT"}' : null), ['package.json', 'README.md', name]).text).toBe('text')
    }
  })
  it('adds the NOTICE file after the licence, as Apache-2.0 asks', () => {
    const f: Record<string, string> = { 'package.json': '{"version":"4.0.0","license":"Apache-2.0"}', LICENSE: 'Apache License', NOTICE: 'Dexie.js\nCopyright (c) David Fahlander' }
    expect(noticeOf('dexie', (x) => f[x] ?? null, Object.keys(f)).text).toBe('Apache License\n\nNOTICE\n\nDexie.js\nCopyright (c) David Fahlander')
  })
  it('says so when a package ships no licence file', () => {
    const n = noticeOf('bare', (f) => (f === 'package.json' ? '{"version":"0.1.0"}' : null), ['package.json'])
    expect(n).toEqual({ name: 'bare', version: '0.1.0', license: 'unknown', text: 'No licence file in the package; package.json says: unknown.' })
  })
  it('copes with a package that has no package.json at all', () => {
    expect(noticeOf('odd', (f) => (f === 'LICENSE' ? 'MIT text' : null), ['LICENSE'])).toEqual({ name: 'odd', version: '?', license: 'unknown', text: 'MIT text' })
  })
  it('reads an old-style licence object', () => {
    expect(noticeOf('old', (f) => (f === 'package.json' ? '{"version":"1.0.0","license":{"type":"BSD-3-Clause"}}' : null), ['package.json']).license).toBe('BSD-3-Clause')
  })
})

describe('renderNotices', () => {
  const n = (name: string, license = 'MIT'): Notice => ({ name, version: '1.0.0', license, text: `${name} licence text` })

  it('opens with the app and its licence, then one section per package, sorted and without repeats', () => {
    const out = renderNotices([n('svelte'), n('dexie', 'Apache-2.0'), n('svelte')])
    expect(out.startsWith('Gom Jabbar\nCopyright © 2026 Paolo Brasolin. Licensed under the EUPL-1.2')).toBe(true)
    const heads = out.split('\n').filter((l) => / — /.test(l))
    expect(heads).toEqual(['dexie 1.0.0 — Apache-2.0', 'svelte 1.0.0 — MIT'])
    expect(out).toContain('dexie licence text')
    expect(out.endsWith('\n')).toBe(true)
  })
})
