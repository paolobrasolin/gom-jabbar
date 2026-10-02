import type { Plugin } from 'vite'

/**
 * The app's Content-Security-Policy (§4, #117). Defence in depth against a compromised dependency: the page runs only
 * its own scripts and talks only to itself and to Google's API servers (Drive, and the token's revocation), so the
 * diary cannot be sent anywhere else. Sign-in is a navigation to Google, which a policy does not govern. Styles allow
 * inline because Svelte writes style attributes; images allow data: and blob: (the icons, the shared report).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

/**
 * Writes the policy into the built index.html as a meta tag (GitHub Pages sends no custom headers), right after the
 * charset so it governs every script after it. Build only: the dev server needs inline scripts and its websocket.
 */
export function csp(): Plugin {
  return {
    name: 'gom-jabbar-csp',
    apply: 'build',
    transformIndexHtml(html: string) {
      const charset = /<meta charset="[^"]*"\s*\/?>/i.exec(html)
      if (!charset) throw new Error('index.html has no charset meta: the policy must come right after it')
      const at = charset.index + charset[0].length
      return `${html.slice(0, at)}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />${html.slice(at)}`
    },
  }
}
