/** The Content-Security-Policy of the built app (§4, #117): defence in depth against a compromised dependency. */
import { describe, it, expect } from 'vitest'
import { CSP, csp } from './csp'

const directives = Object.fromEntries(CSP.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]))

describe('the policy', () => {
  it('lets the app talk to itself and to Google APIs only, and runs no script but its own', () => {
    expect(directives['default-src']).toEqual(["'self'"])
    expect(directives['script-src']).toEqual(["'self'"])
    expect(directives['connect-src']).toEqual(["'self'", 'https://www.googleapis.com', 'https://oauth2.googleapis.com'])
    expect(directives['img-src']).toEqual(["'self'", 'data:', 'blob:'])
    // Svelte writes style attributes; nothing else is let in.
    expect(directives['style-src']).toEqual(["'self'", "'unsafe-inline'"])
    expect(directives['object-src']).toEqual(["'none'"])
    expect(directives['base-uri']).toEqual(["'self'"])
    expect(directives['form-action']).toEqual(["'none'"])
  })

  it('goes into the built page only, first thing after the charset, before any script', () => {
    const plugin = csp()
    expect(plugin.apply).toBe('build')
    const html = '<!doctype html><html><head>\n    <meta charset="UTF-8" />\n    <title>x</title>\n    <script type="module" src="/a.js"></script></head></html>'
    const out = (plugin.transformIndexHtml as (h: string) => string)(html)
    const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`
    expect(out).toContain(meta)
    expect(out.indexOf('<meta charset')).toBeLessThan(out.indexOf(meta))
    expect(out.indexOf(meta)).toBeLessThan(out.indexOf('<script'))
    expect(() => (plugin.transformIndexHtml as (h: string) => string)('<html><head></head></html>')).toThrow()
  })
})
