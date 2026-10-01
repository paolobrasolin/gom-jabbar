import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDb, db } from './db'
import { addEntry } from './entries'
import { addPreset } from './presets'
import { addSymptom, rename } from './vocab'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from './vocabulary'
import { resetAll } from './reset'
import { fakeGoogle } from '../test/fakeDrive'

beforeEach(() => {
  resetDb()
  localStorage.clear()
  history.replaceState(null, '', '/')
})

describe('resetAll', () => {
  it('deletes the diary; the next launch finds a fresh install with the default vocabulary', async () => {
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }], note: 'ciao' })
    await addPreset({ name: 'Schiena', layers: [{ regions: [], asks: ['pain'] }], kind: 'chronic' })
    await addSymptom('Formicolio')
    await rename('symptoms', 'pain', 'Male')
    const g = fakeGoogle()
    await resetAll(g.provider)
    await db.open()
    expect(await db.entries.count()).toBe(0)
    expect(await db.presets.count()).toBe(0)
    expect(await db.symptoms.orderBy('order').toArray()).toEqual([...DEFAULT_SYMPTOMS].sort((a, b) => a.order - b.order))
    expect(await db.tags.orderBy('order').toArray()).toEqual([...DEFAULT_TAGS].sort((a, b) => a.order - b.order))
  })

  it('clears every preference and the Drive state on this phone', async () => {
    localStorage.setItem('gj.prefs', JSON.stringify({ lang: 'en', installedAt: '2026-01-01T00:00:00.000Z' }))
    localStorage.setItem('gj.drive', JSON.stringify({ fileId: 'f1' }))
    await resetAll(fakeGoogle().provider)
    expect(localStorage.length).toBe(0)
  })

  it('clears only its own keys: the sibling apps on the same origin keep theirs', async () => {
    localStorage.setItem('gj.prefs', '{}')
    localStorage.setItem('gj.drive.pending', '{}')
    localStorage.setItem('another.app', 'x')
    sessionStorage.setItem('gj.anything', 'x')
    sessionStorage.setItem('another', 'y')
    await resetAll(fakeGoogle().provider)
    expect(Object.keys(localStorage)).toEqual(['another.app'])
    expect(Object.keys(sessionStorage)).toEqual(['another'])
    localStorage.clear()
    sessionStorage.clear()
  })

  it('a delete that fails leaves Drive connected: the diary and its backup link go together or not at all', async () => {
    const g = fakeGoogle()
    g.signIn()
    await g.provider.put('the diary')
    vi.spyOn(db, 'delete').mockRejectedValueOnce(new DOMException('The operation failed.', 'UnknownError'))
    await expect(resetAll(g.provider)).rejects.toThrow()
    expect(g.drive.revoked).toEqual([])
    expect(await g.provider.whoami()).not.toBeNull()
    vi.restoreAllMocks()
  })

  it('revokes the Drive grant once the diary is gone, while the token is still there to revoke, and leaves the file', async () => {
    const g = fakeGoogle()
    g.signIn()
    await g.provider.put('the diary')
    await resetAll(g.provider)
    expect(g.drive.revoked).toEqual(['tok'])
    expect([...g.drive.files.values()][0].revs.at(-1)!.content).toBe('the diary')
  })

  it('works in a build without Drive', async () => {
    const g = fakeGoogle()
    await expect(resetAll({ ...g.provider, available: false, disconnect: async () => false })).resolves.toBeUndefined()
    await db.open()
    expect(await db.symptoms.count()).toBe(DEFAULT_SYMPTOMS.length)
  })
})
