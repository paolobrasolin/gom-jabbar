import type { Account, CloudProvider, CloudStatus, Failure, Intent, RestorePoint, Result, Resumed } from './cloud'

/**
 * Google Drive behind the cloud interface (§4.2). The token comes from the implicit redirect flow, written by hand:
 * a tap leaves for Google's consent screen, Google sends the browser back with a one-hour token in the fragment, and
 * nothing renews it without another tap. A browser-only app gets no refresh token from Google (#24).
 *
 * One file, named by the build (`gom-jabbar.json` in production), overwritten in place. Drive keeps every upload as a revision but purges unpinned ones
 * after 30 days and only lets pinned ones be downloaded, so the head is pinned when the newest pinned revision is a
 * week old, up to twelve; those are the restore points.
 */

export const WEEK = 7 * 24 * 60 * 60 * 1000
const MAX_PINNED = 12
/** A token this close to its end is treated as dead: a backup must not start and fail halfway. */
const MARGIN = 60 * 1000

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const REVOKE = 'https://oauth2.googleapis.com/revoke'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const KEY = 'gj.drive'

type Stored = {
  token?: string
  expiresAt?: number
  fileId?: string
  lastWriteAt?: string
  account?: Account
  pending?: { state: string; intent: Intent }
}

type Meta = { id: string; modifiedTime: string; headRevisionId: string; size: string; trashed?: boolean }
type Revision = { id: string; modifiedTime: string; keepForever: boolean; size: string }

export type DriveDeps = {
  clientId: string | undefined
  /** Each Cloud project sees only its own files, so dev and production never meet; the names only tell them apart in the Drive UI. */
  fileName: string | undefined
  /** Must match an authorised redirect URI of the OAuth client character for character, trailing slash included. */
  redirectUri: string
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  /** A getter: some browsers throw on the mere access to `localStorage`. */
  storage: () => Storage
  now: () => number
  navigate: (url: string) => void
  random: () => string
}

/** Thrown inside a call and turned into its result at the edge, so the steps read straight. */
class Stop {
  constructor(
    readonly reason: Failure,
    readonly status?: number,
  ) {}
}

export function createDrive(deps: DriveDeps): CloudProvider {
  const available = !!deps.clientId && !!deps.fileName

  function load(): Stored {
    try {
      return (JSON.parse(deps.storage().getItem(KEY) ?? '{}') as Stored) ?? {}
    } catch {
      return {}
    }
  }
  function save(patch: Partial<Stored> | null) {
    const next = patch ? { ...load(), ...patch } : {}
    try {
      deps.storage().setItem(KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable: the token lives only until the next reload */
    }
  }
  function token(): string | null {
    const s = load()
    return s.token && s.expiresAt && s.expiresAt - deps.now() > MARGIN ? s.token : null
  }

  async function call<T>(url: string, init: RequestInit = {}, as: 'json' | 'text' = 'json'): Promise<T> {
    const tok = token()
    if (!tok) throw new Stop('no-token')
    let res: Response
    try {
      res = await deps.fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${tok}` } })
    } catch {
      throw new Stop('network')
    }
    if (res.status === 401) {
      save({ token: undefined, expiresAt: undefined })
      throw new Stop('no-token')
    }
    if (!res.ok) throw new Stop('http', res.status)
    return (as === 'json' ? await res.json() : await res.text()) as T
  }

  async function run<T>(steps: () => Promise<T>): Promise<Result<T>> {
    if (!available) return { ok: false, reason: 'unavailable' }
    try {
      return { ok: true, value: await steps() }
    } catch (e) {
      if (e instanceof Conflict) return { ok: false, reason: 'conflict', remoteAt: e.remoteAt }
      const stop = e as Stop
      return stop.status === undefined ? { ok: false, reason: stop.reason } : { ok: false, reason: stop.reason, status: stop.status }
    }
  }

  const META = 'id,modifiedTime,headRevisionId,size,trashed'

  /** The remembered file if it is still there, else ours found by name (the file scope shows only our files), else null. */
  async function findFile(): Promise<Meta | null> {
    const id = load().fileId
    if (id) {
      try {
        const f = await call<Meta>(`${API}/files/${id}?fields=${META}`)
        if (!f.trashed) return f
      } catch (e) {
        if ((e as Stop).status !== 404) throw e
      }
      save({ fileId: undefined })
    }
    const q = encodeURIComponent(`name = '${deps.fileName}' and trashed = false`)
    const { files } = await call<{ files: Meta[] }>(`${API}/files?q=${q}&orderBy=modifiedTime desc&pageSize=1&fields=files(${META})`)
    if (!files.length) return null
    save({ fileId: files[0].id })
    return files[0]
  }

  const pin = (fileId: string, revId: string, keepForever: boolean) =>
    call(`${API}/files/${fileId}/revisions/${revId}?fields=id,keepForever`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepForever }),
    })
  const revisions = (fileId: string) =>
    call<{ revisions: Revision[] }>(`${API}/files/${fileId}/revisions?pageSize=1000&fields=revisions(id,modifiedTime,keepForever,size)`).then((r) =>
      r.revisions.filter((v) => v.keepForever).sort((a, b) => Date.parse(a.modifiedTime) - Date.parse(b.modifiedTime)),
    )

  /** Best effort: a failed pin costs a restore point, not the backup that just landed. */
  async function pinWeekly(fileId: string, headId: string) {
    try {
      const pinned = await revisions(fileId)
      const newest = pinned.at(-1)
      if (!newest || deps.now() - Date.parse(newest.modifiedTime) >= WEEK) {
        await pin(fileId, headId, true)
        pinned.push({ id: headId, modifiedTime: '', keepForever: true, size: '' })
      }
      for (const old of pinned.slice(0, Math.max(0, pinned.length - MAX_PINNED))) await pin(fileId, old.id, false)
    } catch {
      /* the next backup tries again */
    }
  }

  return {
    available,

    connect(intent) {
      if (!available) return
      const state = deps.random()
      save({ pending: { state, intent } })
      const params = new URLSearchParams({
        client_id: deps.clientId!,
        redirect_uri: deps.redirectUri,
        response_type: 'token',
        scope: SCOPE,
        include_granted_scopes: 'true',
        state,
      })
      const hint = load().account?.email
      if (hint) params.set('login_hint', hint)
      deps.navigate(`${AUTH}?${params}`)
    },

    resume(loc = location, hist = history): Resumed {
      const p = new URLSearchParams(loc.hash.slice(1))
      if (!available || !(p.has('access_token') || p.has('error'))) return null
      // The token must never linger in the address bar, the history or a shared link, whatever else happens.
      hist.replaceState(hist.state, '', loc.pathname + loc.search)
      const pending = load().pending
      if (!pending || p.get('state') !== pending.state) return null
      save({ pending: undefined })
      const tok = p.get('access_token')
      if (!tok) return { intent: pending.intent, error: 'denied' }
      save({ token: tok, expiresAt: deps.now() + Number(p.get('expires_in') ?? 3600) * 1000 })
      return { intent: pending.intent }
    },

    status(): CloudStatus {
      const s = load()
      return { expiresAt: token() ? s.expiresAt! : null, account: s.account ?? null, lastWriteAt: s.lastWriteAt ?? null }
    },

    whoami: () =>
      run(async () => {
        const { user } = await call<{ user: { displayName: string; emailAddress: string } }>(`${API}/about?fields=user(displayName,emailAddress)`)
        const account = { name: user.displayName, email: user.emailAddress }
        save({ account })
        return account
      }),

    put: (text, opts = {}) =>
      run(async () => {
        let f = await findFile()
        if (f) {
          const last = load().lastWriteAt
          const moved = !last || Date.parse(f.modifiedTime) > Date.parse(last)
          if (moved && !opts.force) throw new Conflict(f.modifiedTime)
          // Overwriting what someone else wrote: keep it downloadable first.
          if (moved) await pin(f.id, f.headRevisionId, true)
        } else {
          f = await call<Meta>(`${API}/files?fields=${META}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: deps.fileName, mimeType: 'application/json', appProperties: { app: 'gom-jabbar' } }),
          })
          save({ fileId: f.id, lastWriteAt: f.modifiedTime })
        }
        const up = await call<Meta>(`${UPLOAD}/files/${f.id}?uploadType=media&fields=${META}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: text,
        })
        save({ fileId: up.id, lastWriteAt: up.modifiedTime })
        await pinWeekly(up.id, up.headRevisionId)
        return { at: up.modifiedTime }
      }),

    list: () =>
      run(async () => {
        const f = await findFile()
        if (!f) return []
        const pinned = await revisions(f.id)
        const points: RestorePoint[] = pinned
          .filter((r) => r.id !== f.headRevisionId)
          .map((r) => ({ id: r.id, at: r.modifiedTime, size: Number(r.size) }))
        points.push({ id: 'head', at: f.modifiedTime, size: Number(f.size) })
        return points.reverse()
      }),

    get: (id) =>
      run(async () => {
        const fileId = load().fileId ?? (await findFile())?.id
        if (!fileId) throw new Stop('http', 404)
        return call<string>(id === 'head' ? `${API}/files/${fileId}?alt=media` : `${API}/files/${fileId}/revisions/${id}?alt=media`, {}, 'text')
      }),

    async disconnect() {
      const tok = token()
      save(null)
      if (!tok) return
      try {
        await deps.fetch(REVOKE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${encodeURIComponent(tok)}` })
      } catch {
        /* forgotten here anyway; the grant can be revoked from the Google account */
      }
    },
  }
}

class Conflict {
  constructor(readonly remoteAt: string) {}
}

function randomState(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export const defaults = {
  fetch: (input: string, init?: RequestInit) => fetch(input, init),
  now: () => Date.now(),
  navigate: (url: string) => location.assign(url),
  random: randomState,
}

/** The app's provider: client id and file name come from the build (`.env.*`); without them there is no Drive backup. */
export const googleDrive: CloudProvider = createDrive({
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined,
  fileName: import.meta.env.VITE_DRIVE_FILE_NAME || undefined,
  redirectUri: location.origin + import.meta.env.BASE_URL,
  storage: () => localStorage,
  ...defaults,
})
