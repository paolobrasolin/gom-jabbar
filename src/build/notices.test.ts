import { describe, it, expect } from 'vitest'
import { packageOf, noticeOf, renderNotices, choirNotice, type Notice } from './notices'

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

  it('is a plain page like the privacy and terms pages, with the same top line', () => {
    const out = renderNotices([n('svelte')])
    expect(out.startsWith('<!doctype html>\n<html lang="en">')).toBe(true)
    expect(out).toContain('<meta charset="utf-8">')
    expect(out).toContain('<title>Gom Jabbar · Open source licences</title>')
    // English first, then Italian, each with its own header line.
    const en = out.indexOf('<a href="./">Gom Jabbar</a> · <a href="privacy-policy.html">Privacy policy</a> · <a href="terms-of-service.html">Terms of service</a> · <strong>Open source licences</strong> · <a href="#it">Italiano</a>')
    const it = out.indexOf('<a href="./">Gom Jabbar</a> · <a href="privacy-policy.html#it">Informativa sulla privacy</a> · <a href="terms-of-service.html#it">Termini d\'uso</a> · <strong>Licenze open source</strong> · <a href="#en">English</a>')
    expect(en).toBeGreaterThan(0)
    expect(it).toBeGreaterThan(en)
    expect(out.indexOf('<div lang="it" id="it">')).toBeLessThan(it)
    // Each language's jump link lands on that language's header line, not below it.
    expect(out).toContain('<p id="en"><a href="./">Gom Jabbar</a>')
    expect(out).not.toContain('<h1 id="en">')
    expect(out).toContain('<h1>Open source licences</h1>')
    expect(out).toContain('<h1>Licenze open source</h1>')
    expect(out).toContain('EUPL-1.2')
    expect(out.endsWith('</html>\n')).toBe(true)
  })

  it('has one section per package, sorted and without repeats, its licence text kept as written', () => {
    const out = renderNotices([n('svelte'), n('dexie', 'Apache-2.0'), n('svelte')])
    expect([...out.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)].map((m) => [m[1], m[2]])).toEqual([
      ['dexie', 'dexie 1.0.0 — Apache-2.0'],
      ['svelte', 'svelte 1.0.0 — MIT'],
    ])
    expect(out).toContain('<pre>dexie licence text</pre>')
  })

  it('escapes what the licence texts contain, so a text cannot become markup', () => {
    const out = renderNotices([{ name: '@scope/pkg', version: '1.0.0', license: 'MIT', text: 'See <https://x.test/?a=1&b=2> "quoted"' }])
    expect(out).toContain('<h2 id="scope-pkg">@scope/pkg 1.0.0 — MIT</h2>')
    expect(out).toContain('<pre>See &lt;https://x.test/?a=1&amp;b=2&gt; "quoted"</pre>')
  })
})

describe('choirNotice', () => {
  // #121: the outlines are the CHOIR body map's own regions, devised at Stanford; CHOIRBM's metadata names Stanford as
  // copyright holder. The entry credits them and the papers, says the app is not affiliated, then the MIT text.
  const n = choirNotice('MIT License\n\nCopyright (c) 2021 Eric Cramer\n')

  it('credits the CHOIR body map, its authors and Stanford, then the package licence', () => {
    expect(n).toMatchObject({ name: 'CHOIRBM', license: 'MIT' })
    expect(n.text).toContain('The CHOIR Body Map (Collaborative Health Outcomes Information Registry), Stanford University Division of Pain Medicine')
    expect(n.text).toContain('devised by Ming-Chih J. Kao and Sean Mackey')
    expect(n.text).toContain('the CHOIRBM R package by Eric Cramer')
    expect(n.text).toContain('names Stanford University School of Medicine as copyright holder')
    expect(n.text).toContain('not affiliated with or endorsed by Stanford University or CHOIR')
    expect(n.text).toContain('doi:10.1097/PR9.0000000000000880')
    expect(n.text).toContain('doi:10.1371/journal.pcbi.1010496')
    expect(n.text.endsWith('Copyright (c) 2021 Eric Cramer')).toBe(true)
  })

  it('names no licence for the map but the package one: the paper is CC BY-NC-ND, the outlines are not', () => {
    expect(n.text).not.toContain('CC BY-NC-ND')
  })
})
