import { expect } from 'vitest'
import { createDrive } from '../lib/drive'
import type { Intent, Resumed } from '../lib/cloud'

/** The one token the fake accepts. */
export const TOKEN = 'tok'

type Rev = { id: string; modifiedTime: string; keepForever: boolean; content: string }
type DFile = { id: string; name: string; trashed: boolean; appProperties?: Record<string, string>; mimeType?: string; revs: Rev[] }

/** Just enough of Drive v3 for the calls the client makes, with revisions, pinning and injected failures. */
export class FakeDrive {
  files = new Map<string, DFile>()
  calls: string[] = []
  revoked: string[] = []
  failures: { match: RegExp; status?: number; network?: boolean }[] = []
  private seq = 0
  constructor(private clock: () => number) {}

  /** Another device, or the Drive web UI, writes the file. */
  write(id: string, content: string) {
    this.files.get(id)!.revs.push({ id: `r${++this.seq}`, modifiedTime: new Date(this.clock()).toISOString(), keepForever: false, content })
  }
  only(): DFile {
    expect(this.files.size).toBe(1)
    return [...this.files.values()][0]
  }
  pinned(): Rev[] {
    return this.only().revs.filter((r) => r.keepForever)
  }
  private meta(f: DFile) {
    const head = f.revs.at(-1)!
    return { id: f.id, modifiedTime: head.modifiedTime, headRevisionId: head.id, size: String(head.content.length), trashed: f.trashed }
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    const call = `${method} ${url.host}${url.pathname}`
    this.calls.push(call)
    const fail = this.failures.find((f) => f.match.test(call))
    if (fail) {
      this.failures.splice(this.failures.indexOf(fail), 1)
      if (fail.network) throw new TypeError('Failed to fetch')
      return new Response('{}', { status: fail.status })
    }
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
    if (url.host === 'oauth2.googleapis.com') {
      this.revoked.push(new URLSearchParams(String(init.body)).get('token')!)
      return json({})
    }
    if ((init.headers as Record<string, string>)?.Authorization !== `Bearer ${TOKEN}`) return json({ error: 'unauthorized' }, 401)
    const path = url.pathname
    const media = url.searchParams.get('alt') === 'media'
    let m: RegExpMatchArray | null
    if (path === '/drive/v3/about') return json({ user: { displayName: 'Paolo', emailAddress: 'paolo@example.test' } })
    if (path === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q')!
      expect(q).toContain("name = 'gom-jabbar.json'")
      expect(q).toContain('trashed = false')
      const found = [...this.files.values()].filter((f) => f.name === 'gom-jabbar.json' && !f.trashed).map((f) => this.meta(f))
      found.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
      return json({ files: found })
    }
    if (path === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(String(init.body)) as Partial<DFile>
      const f: DFile = { id: `f${++this.seq}`, name: body.name!, mimeType: body.mimeType, appProperties: body.appProperties, trashed: false, revs: [] }
      f.revs.push({ id: `r${++this.seq}`, modifiedTime: new Date(this.clock()).toISOString(), keepForever: false, content: '' })
      this.files.set(f.id, f)
      return json(this.meta(f))
    }
    if ((m = path.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/)) && method === 'PATCH') {
      expect(url.searchParams.get('uploadType')).toBe('media')
      const f = this.files.get(m[1])
      if (!f) return json({}, 404)
      this.write(f.id, String(init.body))
      return json(this.meta(f))
    }
    if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)\/revisions\/([^/]+)$/))) {
      const rev = this.files.get(m[1])?.revs.find((r) => r.id === m![2])
      if (!rev) return json({}, 404)
      if (method === 'PATCH') {
        rev.keepForever = (JSON.parse(String(init.body)) as { keepForever: boolean }).keepForever
        return json({ id: rev.id, keepForever: rev.keepForever })
      }
      // Only pinned revisions of a non-Google-Docs file can be downloaded through the API.
      if (media) return rev.keepForever ? new Response(rev.content) : json({}, 403)
      return json({ id: rev.id })
    }
    if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)\/revisions$/))) {
      const f = this.files.get(m[1])
      if (!f) return json({}, 404)
      return json({ revisions: f.revs.map((r) => ({ id: r.id, modifiedTime: r.modifiedTime, keepForever: r.keepForever, size: String(r.content.length) })) })
    }
    if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)$/))) {
      const f = this.files.get(m[1])
      if (!f) return json({}, 404)
      return media ? new Response(f.revs.at(-1)!.content) : json(this.meta(f))
    }
    return json({ error: `unexpected ${call}` }, 400)
  }
}

/**
 * The real Drive client on a fake Drive, for screen tests: `signIn` does what a tap and Google's consent screen do,
 * and returns what the app gets at startup when it comes back.
 */
export function fakeGoogle(now: () => number = () => Date.now()) {
  const drive = new FakeDrive(now)
  const navigated: string[] = []
  const provider = createDrive({
    clientId: 'client-id',
    redirectUri: 'http://localhost:3000/',
    fetch: drive.fetch,
    storage: () => localStorage,
    now,
    navigate: (u) => void navigated.push(u),
    random: () => `state${navigated.length + 1}`,
  })
  function signIn(intent: Intent = 'backup'): Resumed {
    provider.connect(intent)
    const state = new URL(navigated.at(-1)!).searchParams.get('state')
    history.replaceState(null, '', `/#access_token=${TOKEN}&token_type=Bearer&expires_in=3599&state=${state}`)
    return provider.resume()
  }
  return { drive, provider, navigated, signIn }
}
