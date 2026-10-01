/**
 * The cloud backup seen from the app (§4.2): one provider behind this interface, so nothing above it knows whether
 * Google Drive or another storage holds the file. Every network outcome is a result, never an exception, so the card
 * in Settings can say what went wrong.
 */

/** What a tap was for, carried across the provider's consent screen and resumed when the app comes back. */
export type Intent = 'backup' | 'restore'

export type Failure =
  /** No client id in this build: the provider cannot be used at all. */
  | 'unavailable'
  /** No live token: only a tap (`connect`) gets one. */
  | 'no-token'
  /** The person said no on the consent screen. */
  | 'denied'
  | 'network'
  | 'http'
  /** The remote file changed since this device last wrote it, or this device never wrote it. */
  | 'conflict'

export type Result<T> = { ok: true; value: T } | { ok: false; reason: Failure; status?: number; remoteAt?: string }

/** The Google account the backup lives in: its email only, shown in Settings and handed to Google as the sign-in hint. */
export type Account = { email: string }

/** A version of the backup that can be downloaded: the current file (`id: 'head'`) or a pinned older one. */
export type RestorePoint = { id: string; at: string; size: number }

export type CloudStatus = {
  /** When the token dies, while one is alive. */
  expiresAt: number | null
  account: Account | null
  /** When this device last wrote the remote file, as the provider reported it. */
  lastWriteAt: string | null
}

export type Resumed = { intent: Intent; error?: Failure } | null

export interface CloudProvider {
  readonly available: boolean
  /** From a tap only: leaves the app for the consent screen; `resume` picks up `intent` when it comes back. */
  connect(intent: Intent): void
  /** At startup, before anything renders: takes a token out of the URL and strips it. */
  resume(loc?: Pick<Location, 'hash' | 'pathname' | 'search'>, hist?: Pick<History, 'replaceState' | 'state'>): Resumed
  status(): CloudStatus
  whoami(): Promise<Result<Account>>
  /** Uploads unless the remote moved under us (`conflict`); `force` keeps the remote version as a restore point and writes anyway. */
  put(text: string, opts?: { force?: boolean }): Promise<Result<{ at: string }>>
  /** Newest first. */
  list(): Promise<Result<RestorePoint[]>>
  get(id: string): Promise<Result<string>>
  /**
   * Forgets the token, the file and the account on this device; the file stays where it is. True when it also revoked
   * the grant with Google, which needs a token still alive: past its hour, the permission stays in the Google account.
   */
  disconnect(): Promise<boolean>
}
