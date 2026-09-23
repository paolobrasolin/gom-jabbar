import { describe, it, expect, beforeEach, vi } from 'vitest'

/** The prefs are a singleton read at import: each case loads the module afresh over its own storage. */
async function loadPrefs() {
  vi.resetModules()
  return (await import('./prefs.svelte')).prefs
}

describe('prefs', () => {
  beforeEach(() => localStorage.clear())

  it('starts with both mirrors as designed (#22): sides off, views on', async () => {
    const p = await loadPrefs()
    expect(p.mirror).toBe(false)
    expect(p.mirrorViews).toBe(true)
  })

  it('an install from before the views mirror had sides on by default, never by choice: it is reset once, and nothing else is touched', async () => {
    localStorage.setItem('gj.prefs', JSON.stringify({ lang: 'en', mirror: true, figure: 'male' }))
    const p = await loadPrefs()
    expect(p.mirror).toBe(false)
    expect(p.mirrorViews).toBe(true)
    expect(p.lang).toBe('en')
    expect(p.figure).toBe('male')
  })

  it('a store that knows the views mirror keeps what it says', async () => {
    localStorage.setItem('gj.prefs', JSON.stringify({ mirror: true, mirrorViews: false }))
    const p = await loadPrefs()
    expect(p.mirror).toBe(true)
    expect(p.mirrorViews).toBe(false)
  })

  it('a broken store falls back to the defaults', async () => {
    localStorage.setItem('gj.prefs', '{not json')
    const p = await loadPrefs()
    expect(p.mirror).toBe(false)
  })
})
