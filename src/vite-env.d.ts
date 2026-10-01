/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string
/** The day of the commit the app was built from, YYYY-MM-DD. */
declare const __APP_DATE__: string

interface ImportMetaEnv {
  // From .env.production, .env.development or .env.test; empty means no Drive backup.
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** The backup file's name in Drive; empty means no Drive backup. */
  readonly VITE_DRIVE_FILE_NAME?: string
}
