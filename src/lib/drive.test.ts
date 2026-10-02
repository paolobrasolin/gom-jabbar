import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createDrive, defaults, googleDrive, WEEK } from './drive'
import { FakeDrive, TOKEN } from '../test/fakeDrive'

const CLIENT = 'client-id.apps.googleusercontent.com'
const REDIRECT = 'https://example.test/gom-jabbar/'
const T0 = Date.parse('2026-09-01T10:00:00.000Z')
const MIN = 60_000

let now: number
let drive: FakeDrive
let navigated: string[]
let storage: Storage
let states: number

/** `make(undefined)` is a build without a client id; `make()` has one. */
function make(...args: [clientId?: string]) {
  return createDrive({
    clientId: args.length ? args[0] : CLIENT,
    fileName: 'gom-jabbar.json',
    redirectUri: REDIRECT,
    fetch: drive.fetch,
    storage: () => storage,
    now: () => now,
    navigate: (u) => void navigated.push(u),
    random: () => `state${++states}`,
  })
}

/** A tap, the consent screen, and the way back with a token in the fragment. */
function signIn(p: ReturnType<typeof make>, intent: 'backup' | 'restore' = 'backup') {
  p.connect(intent)
  const state = new URL(navigated.at(-1)!).searchParams.get('state')
  history.replaceState(null, '', `/gom-jabbar/#access_token=${TOKEN}&token_type=Bearer&expires_in=3599&scope=x&state=${state}`)
  return p.resume()
}

beforeEach(() => {
  now = T0
  drive = new FakeDrive(() => now)
  navigated = []
  localStorage.clear()
  storage = localStorage
  states = 0
  history.replaceState(null, '', '/gom-jabbar/')
})

describe('connect', () => {
  it('leaves for Google with the file scope, the redirect and a fresh state, and remembers the intent', () => {
    const p = make()
    expect(p.available).toBe(true)
    p.connect('restore')
    const url = new URL(navigated[0])
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT,
      redirect_uri: REDIRECT,
      response_type: 'token',
      scope: 'https://www.googleapis.com/auth/drive.file',
      include_granted_scopes: 'true',
      state: 'state1',
    })
  })
  it('hints the known account, so a second tap can skip the account picker', async () => {
    const p = make()
    signIn(p)
    await p.whoami()
    p.connect('backup')
    expect(new URL(navigated.at(-1)!).searchParams.get('login_hint')).toBe('paolo@example.test')
  })
  it('is unavailable without a client id: no navigation, every call says so', async () => {
    const p = make(undefined)
    expect(p.available).toBe(false)
    p.connect('backup')
    expect(navigated).toEqual([])
    expect(await p.put('{}')).toEqual({ ok: false, reason: 'unavailable' })
    expect(await p.list()).toEqual({ ok: false, reason: 'unavailable' })
    expect(await p.get('head')).toEqual({ ok: false, reason: 'unavailable' })
    expect(await p.whoami()).toEqual({ ok: false, reason: 'unavailable' })
    expect(make('').available).toBe(false)
    expect(createDrive({ ...defaults, clientId: CLIENT, fileName: '', redirectUri: REDIRECT, storage: () => localStorage }).available).toBe(false)
  })
})

describe('resume', () => {
  it('takes the token out of the fragment, strips it and returns the intent', () => {
    const p = make()
    expect(signIn(p, 'restore')).toEqual({ intent: 'restore' })
    expect(location.hash).toBe('')
    expect(location.pathname).toBe('/gom-jabbar/')
    expect(p.status().expiresAt).toBe(T0 + 3599_000)
    // A fresh instance, as after a relaunch, finds the token in storage.
    expect(make().status().expiresAt).toBe(T0 + 3599_000)
  })
  it('ignores a token whose state does not match, and still strips it', () => {
    const p = make()
    p.connect('backup')
    history.replaceState(null, '', `/gom-jabbar/?x=1#access_token=${TOKEN}&expires_in=3599&state=forged`)
    expect(p.resume()).toBeNull()
    expect(location.hash).toBe('')
    expect(location.search).toBe('?x=1')
    expect(p.status().expiresAt).toBeNull()
  })
  it('ignores a fragment when no tap is pending', () => {
    history.replaceState(null, '', `/gom-jabbar/#access_token=${TOKEN}&expires_in=3599&state=state1`)
    const p = make()
    expect(p.resume()).toBeNull()
    expect(p.status().expiresAt).toBeNull()
  })
  it('leaves an unrelated fragment alone', () => {
    history.replaceState(null, '', '/gom-jabbar/#somewhere')
    expect(make().resume()).toBeNull()
    expect(location.hash).toBe('#somewhere')
  })
  it('reports a refusal on the consent screen with the intent', () => {
    const p = make()
    p.connect('backup')
    history.replaceState(null, '', '/gom-jabbar/#error=access_denied&state=state1')
    expect(p.resume()).toEqual({ intent: 'backup', error: 'denied' })
    expect(location.hash).toBe('')
    expect(p.status().expiresAt).toBeNull()
  })
  it('does nothing without a client id', () => {
    history.replaceState(null, '', `/gom-jabbar/#access_token=${TOKEN}&state=state1`)
    expect(make(undefined).resume()).toBeNull()
  })
})

describe('the token', () => {
  it('lives until a minute before it expires, then every call asks for a tap', async () => {
    const p = make()
    signIn(p)
    now = T0 + 3599_000 - MIN - 1
    expect(p.status().expiresAt).not.toBeNull()
    now += 2
    expect(p.status().expiresAt).toBeNull()
    const calls = drive.calls.length
    expect(await p.put('{}')).toEqual({ ok: false, reason: 'no-token' })
    expect(drive.calls.length).toBe(calls)
  })
  it('is dropped when Google answers 401', async () => {
    const p = make()
    signIn(p)
    drive.failures.push({ match: /about/, status: 401 })
    expect(await p.whoami()).toEqual({ ok: false, reason: 'no-token' })
    expect(p.status().expiresAt).toBeNull()
  })
})

describe('whoami', () => {
  it('reads only the account email under the file scope, and remembers it; no name', async () => {
    const p = make()
    signIn(p)
    expect(await p.whoami()).toEqual({ ok: true, value: { email: 'paolo@example.test' } })
    expect(make().status().account).toEqual({ email: 'paolo@example.test' })
    expect(storage.getItem('gj.drive')).not.toContain('Paolo')
  })

  it('forgets a name an older version stored', () => {
    storage.setItem('gj.drive', JSON.stringify({ account: { name: 'Paolo', email: 'paolo@example.test' } }))
    expect(make().status().account).toEqual({ email: 'paolo@example.test' })
    expect(storage.getItem('gj.drive')).not.toContain('Paolo')
  })
})

describe('put', () => {
  it('creates the file on the first backup, tagged as ours, and pins it as the first restore point', async () => {
    const p = make()
    signIn(p)
    const res = await p.put('{"a":1}')
    expect(res).toEqual({ ok: true, value: { at: new Date(T0).toISOString(), kept: null } })
    const f = drive.only()
    expect(f.name).toBe('gom-jabbar.json')
    expect(f.mimeType).toBe('application/json')
    expect(f.appProperties).toEqual({ app: 'gom-jabbar' })
    expect(f.revs.at(-1)!.content).toBe('{"a":1}')
    expect(drive.pinned().map((r) => r.content)).toEqual(['{"a":1}'])
    expect(p.status().lastWriteAt).toBe(new Date(T0).toISOString())
  })
  it('uses the file name of the build, and never sees a file of another name', async () => {
    const p = make()
    signIn(p)
    await p.put('real')
    const dev = createDrive({
      clientId: CLIENT,
      fileName: 'gom-jabbar-dev.json',
      redirectUri: REDIRECT,
      fetch: drive.fetch,
      storage: () => sessionStorage,
      now: () => now,
      navigate: (u) => void navigated.push(u),
      random: () => `state${++states}`,
    })
    dev.connect('backup')
    history.replaceState(null, '', `/#access_token=${TOKEN}&expires_in=3599&state=state${states}`)
    dev.resume()
    now += MIN
    expect(await dev.list()).toEqual({ ok: true, value: [] })
    expect((await dev.put('dev')).ok).toBe(true)
    expect([...drive.files.values()].map((f) => [f.name, f.revs.at(-1)!.content])).toEqual([
      ['gom-jabbar.json', 'real'],
      ['gom-jabbar-dev.json', 'dev'],
    ])
    sessionStorage.clear()
  })
  it('overwrites the same file in place and pins at most one version a week', async () => {
    const p = make()
    signIn(p)
    await p.put('v1')
    now += MIN
    await p.put('v2')
    expect(drive.only().revs.at(-1)!.content).toBe('v2')
    expect(drive.pinned().map((r) => r.content)).toEqual(['v1'])
    now = T0 + WEEK
    signIn(p)
    await p.put('v3')
    expect(drive.pinned().map((r) => r.content)).toEqual(['v1', 'v3'])
    expect(drive.calls.filter((c) => c.startsWith('POST www.googleapis.com/drive'))).toHaveLength(1)
  })
  it('keeps twelve pinned versions, unpinning the oldest', async () => {
    const p = make()
    for (let w = 0; w < 14; w++) {
      now = T0 + w * WEEK
      signIn(p)
      await p.put(`w${w}`)
    }
    expect(drive.pinned().map((r) => r.content)).toEqual(['w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11', 'w12', 'w13'])
  })
  it('still succeeds when pinning fails: the upload is what matters', async () => {
    const p = make()
    signIn(p)
    drive.failures.push({ match: /PATCH .*revisions/, status: 500 })
    expect((await p.put('v1')).ok).toBe(true)
    expect(drive.pinned()).toEqual([])
    drive.failures.push({ match: /GET .*revisions$/, network: true })
    now += WEEK
    signIn(p)
    expect((await p.put('v2')).ok).toBe(true)
  })
  it('stops with a conflict when the file changed since this device wrote it', async () => {
    const p = make()
    signIn(p)
    await p.put('mine')
    now += MIN
    drive.write(drive.only().id, 'theirs')
    now += MIN
    expect(await p.put('mine again')).toEqual({ ok: false, reason: 'conflict', remoteAt: new Date(T0 + MIN).toISOString() })
    expect(drive.only().revs.at(-1)!.content).toBe('theirs')
  })
  it('stops with a conflict on a device that never wrote the file (a new phone)', async () => {
    const old = make()
    signIn(old)
    await old.put('the diary')
    localStorage.clear()
    const p = make()
    signIn(p)
    now += MIN
    expect(await p.put('{}')).toEqual({ ok: false, reason: 'conflict', remoteAt: new Date(T0).toISOString() })
    expect(drive.only().revs.at(-1)!.content).toBe('the diary')
  })
  it('with force, pins what is there before overwriting it, so it can still be restored', async () => {
    const p = make()
    signIn(p)
    await p.put('mine')
    now += MIN
    drive.write(drive.only().id, 'theirs')
    now += MIN
    expect((await p.put('mine again', { force: true })).ok).toBe(true)
    expect(drive.only().revs.at(-1)!.content).toBe('mine again')
    expect(drive.pinned().map((r) => r.content)).toEqual(['mine', 'theirs'])
  })
  it('pins the file it replaces when the backup is much smaller, and says when that file was written (#113)', async () => {
    const p = make()
    signIn(p)
    await p.put('x'.repeat(1000))
    now += MIN
    expect(await p.put('x'.repeat(900))).toEqual({ ok: true, value: { at: new Date(now).toISOString(), kept: null } })
    now += MIN
    // A diary emptied by mistake, a restore gone wrong: what it replaces must stay downloadable past Drive's 30 days.
    expect(await p.put('x'.repeat(400))).toEqual({ ok: true, value: { at: new Date(now).toISOString(), kept: new Date(now - MIN).toISOString() } })
    expect(drive.pinned().map((r) => r.content.length)).toEqual([1000, 900])
    // Half or more is not much smaller.
    now += MIN
    expect((await p.put('x'.repeat(200))) as { value?: { kept: unknown } }).toMatchObject({ value: { kept: null } })
    // No pin, no overwrite.
    now += MIN
    drive.failures.push({ match: /PATCH .*revisions/, status: 500 })
    expect(await p.put('x')).toEqual({ ok: false, reason: 'http', status: 500 })
    expect(drive.only().revs.at(-1)!.content).toHaveLength(200)
  })

  it('finds the file again when the remembered id is gone, and creates one when there is none', async () => {
    const p = make()
    signIn(p)
    await p.put('v1')
    const first = drive.only()
    drive.files.delete(first.id)
    now += MIN
    expect((await p.put('v2')).ok).toBe(true)
    expect(drive.only().id).not.toBe(first.id)
    drive.only().trashed = true
    now += MIN
    expect((await p.put('v3')).ok).toBe(true)
    expect([...drive.files.values()].filter((f) => !f.trashed).map((f) => f.revs.at(-1)!.content)).toEqual(['v3'])
  })
  it('maps failures to reasons', async () => {
    const p = make()
    signIn(p)
    drive.failures.push({ match: /GET .*files/, network: true })
    expect(await p.put('x')).toEqual({ ok: false, reason: 'network' })
    drive.failures.push({ match: /POST .*files/, status: 403 })
    expect(await p.put('x')).toEqual({ ok: false, reason: 'http', status: 403 })
    drive.failures.push({ match: /PATCH .*upload/, status: 500 })
    expect(await p.put('x')).toEqual({ ok: false, reason: 'http', status: 500 })
    drive.failures.push({ match: /GET .*files\/f/, status: 500 })
    expect(await p.put('x')).toEqual({ ok: false, reason: 'http', status: 500 })
    // The file this device created before the failed upload is still ours: no conflict, no second file.
    expect(await p.put('x')).toEqual({ ok: true, value: { at: expect.any(String), kept: null } })
    expect(drive.only().revs.at(-1)!.content).toBe('x')
  })
})

describe('list and get', () => {
  it('lists the current file and the pinned versions, newest first, and downloads each', async () => {
    const p = make()
    signIn(p)
    await p.put('week 0')
    now += MIN
    await p.put('week 0b')
    now = T0 + WEEK
    signIn(p)
    await p.put('week 1')
    now += MIN
    await p.put('now')
    const res = await p.list()
    if (!res.ok) throw new Error(res.reason)
    expect(res.value.map((r) => [r.at, r.size])).toEqual([
      [new Date(T0 + WEEK + MIN).toISOString(), 3],
      [new Date(T0 + WEEK).toISOString(), 6],
      [new Date(T0).toISOString(), 6],
    ])
    expect(res.value[0].id).toBe('head')
    const texts = await Promise.all(res.value.map((r) => p.get(r.id)))
    expect(texts).toEqual([
      { ok: true, value: 'now' },
      { ok: true, value: 'week 1' },
      { ok: true, value: 'week 0' },
    ])
  })
  it('does not list the head twice when it is pinned', async () => {
    const p = make()
    signIn(p)
    await p.put('only')
    const res = await p.list()
    expect(res.ok && res.value.map((r) => r.id)).toEqual(['head'])
  })
  it('finds the file on a new device and lists nothing when there is none', async () => {
    const p = make()
    signIn(p)
    expect(await p.list()).toEqual({ ok: true, value: [] })
    expect(await p.get('head')).toEqual({ ok: false, reason: 'http', status: 404 })
    await p.put('the diary')
    localStorage.clear()
    const fresh = make()
    signIn(fresh)
    const res = await fresh.list()
    expect(res.ok && res.value.length).toBe(1)
    expect(await fresh.get('head')).toEqual({ ok: true, value: 'the diary' })
  })
  it('maps failures to reasons', async () => {
    const p = make()
    expect(await p.list()).toEqual({ ok: false, reason: 'no-token' })
    signIn(p)
    await p.put('x')
    drive.failures.push({ match: /revisions$/, status: 500 })
    expect(await p.list()).toEqual({ ok: false, reason: 'http', status: 500 })
    drive.failures.push({ match: /GET .*files\/f/, network: true })
    expect(await p.get('head')).toEqual({ ok: false, reason: 'network' })
    drive.failures.push({ match: /GET .*files\/f/, status: 500 })
    expect(await p.list()).toEqual({ ok: false, reason: 'http', status: 500 })
  })
})

describe('disconnect', () => {
  it('revokes the token and forgets everything on this device, leaving the file in Drive', async () => {
    const p = make()
    signIn(p)
    await p.whoami()
    await p.put('the diary')
    expect(await p.disconnect()).toBe(true)
    expect(drive.revoked).toEqual([TOKEN])
    expect(p.status()).toEqual({ expiresAt: null, account: null, lastWriteAt: null })
    expect(make().status()).toEqual({ expiresAt: null, account: null, lastWriteAt: null })
    expect(drive.only().revs.at(-1)!.content).toBe('the diary')
  })
  it('forgets even when the revocation fails or there is no token', async () => {
    const p = make()
    signIn(p)
    drive.failures.push({ match: /revoke/, network: true })
    // Not revoked: the caller says the permission stays with Google.
    expect(await p.disconnect()).toBe(false)
    expect(p.status().expiresAt).toBeNull()
    expect(await p.disconnect()).toBe(false)
    expect(drive.revoked).toEqual([])
  })
})

describe('storage', () => {
  it('survives storage that throws, as in a locked-down browser', async () => {
    storage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    }
    const p = make()
    expect(p.status()).toEqual({ expiresAt: null, account: null, lastWriteAt: null })
    expect(() => p.connect('backup')).not.toThrow()
  })
  it('ignores garbage in storage', () => {
    localStorage.setItem('gj.drive', '{not json')
    expect(make().status()).toEqual({ expiresAt: null, account: null, lastWriteAt: null })
  })
})

describe('the defaults', () => {
  it('make a fresh random state each time', () => {
    const a = defaults.random()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(defaults.random()).not.toBe(a)
  })
  it('use the real clock, fetch and location', async () => {
    expect(Math.abs(defaults.now() - Date.now())).toBeLessThan(1000)
    const fetch = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetch)
    await defaults.fetch('https://example.test/')
    expect(fetch).toHaveBeenCalledWith('https://example.test/', undefined)
    vi.unstubAllGlobals()
    defaults.navigate('#probe')
    expect(location.hash).toBe('#probe')
  })
  it('come from the build: no client id under tests, so the app offers no Drive backup', () => {
    expect(googleDrive.available).toBe(false)
    expect(googleDrive.status()).toEqual({ expiresAt: null, account: null, lastWriteAt: null })
  })
})
