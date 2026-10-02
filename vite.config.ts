import { svelte } from '@sveltejs/vite-plugin-svelte'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { packageOf, noticeOf, renderNotices } from './src/build/notices.ts'
import { csp } from './src/build/csp.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// Short commit hash as semver build metadata, so Settings identifies the exact build.
// Nix sets GIT_REV (no git in the sandbox); locally we ask git; otherwise "local".
function gitRev(): string {
  if (process.env.GIT_REV) return process.env.GIT_REV
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'local'
  }
}

// The day of the commit being built, YYYY-MM-DD, shown next to the version in Settings: the same commit always shows the
// same date. Nix sets GIT_DATE from the flake; locally we ask git; otherwise today.
function gitDate(): string {
  if (process.env.GIT_DATE) return process.env.GIT_DATE
  try {
    return execSync('git log -1 --format=%cs', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

// Code the build writes into the output that is not in the app's module graph, listed by hand (`npm run notices` fails
// when the output shows one that is not here, #117): the service worker's runtime, which the PWA plugin bundles after
// this build (generateSW with a precache and a navigation fallback ships these Workbox modules), the AMD loader sw.js
// begins with (Google's, from Workbox's fork of rollup-plugin-off-main-thread), registerSW.js from the plugin itself,
// and Vite's own runtime helpers in the bundle (the modulepreload polyfill, the preload of the dynamic import).
const OUTPUT_PACKAGES = ['workbox-core', 'workbox-precaching', 'workbox-routing', 'workbox-strategies', '@trickfilm400/rollup-plugin-off-main-thread', 'vite-plugin-pwa', 'vite']

/** open-source-licences.html next to the app (#35): every package bundled into it, the service worker's runtime, the body map. */
function notices(): Plugin {
  const read = (dir: string) => (file: string) => {
    try {
      return readFileSync(`${dir}/${file}`, 'utf8')
    } catch {
      return null
    }
  }
  const notice = (name: string, dir: string) => noticeOf(name, read(dir), readdirSync(dir))
  return {
    name: 'gom-jabbar-notices',
    // The list comes from what the bundle contains, so the dev server has none: say so instead of serving the app.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `${server.config.base}open-source-licences.html`) return next()
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('open-source-licences.html is written by the build, from what the bundle contains.\nRun `npm run build && npm run preview` to see it.\n')
      })
    },
    generateBundle(_, bundle) {
      const dirs = new Map<string, string>(OUTPUT_PACKAGES.map((n) => [n, `node_modules/${n}`]))
      for (const out of Object.values(bundle)) {
        if (out.type !== 'chunk') continue
        for (const id of Object.keys(out.modules)) {
          const name = packageOf(id)
          const path = id.split('?')[0]
          if (name && !dirs.has(name)) dirs.set(name, `${path.slice(0, path.lastIndexOf('node_modules'))}node_modules/${name}`)
        }
      }
      const choir = {
        name: 'CHOIRBM',
        version: '(body map polygons, scripts/choir)',
        license: 'MIT',
        text: `${readFileSync('scripts/choir/LICENSE.md', 'utf8').trim()}\n\nThe CHOIR body map itself: Scherrer KH et al., "Development and validation of the Collaborative Health Outcomes Information Registry body map", PAIN Reports 2021;6(1):e880, open access under CC BY-NC-ND 4.0.`,
      }
      const source = renderNotices([...[...dirs].map(([n, d]) => notice(n, d)), choir])
      this.emitFile({ type: 'asset', fileName: 'open-source-licences.html', source })
    },
  }
}

// Per-mode values live in .env.production (`vite build`), .env.development (`vite`)
// and .env.test (Vitest). Nothing is defaulted here: an empty
// VITE_GOOGLE_CLIENT_ID means no Drive backup, never the wrong Google project.
export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(`${pkg.version}+${gitRev()}`), __APP_DATE__: JSON.stringify(gitDate()) },
  base: loadEnv(mode, process.cwd(), '').BASE_PATH,
  plugins: [
    svelte(),
    notices(),
    csp(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered by src/lib/update.ts through virtual:pwa-register, so nothing is injected. Keep injectRegister on its
      // default: set to false, the plugin also drops skipWaiting and a new release waits for every tab to close.
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable.png'],
      manifest: {
        name: 'Gom Jabbar',
        short_name: 'Gom Jabbar',
        description: 'Diario del dolore',
        lang: 'it',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#111114',
        theme_color: '#111114',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: { conditions: process.env.VITEST ? ['browser'] : undefined },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,svelte}'],
      exclude: ['src/**/*.test.ts', 'src/test/**', 'src/main.ts', 'src/vite-env.d.ts'],
      reporter: process.env.COVERAGE_HTML ? ['text', 'html'] : ['text-summary'],
      // Ratchet: raise these when coverage grows, never lower them. `npm test` fails below.
      thresholds: {
        'src/lib/**': { lines: 99.8, statements: 99.7, functions: 99.4, branches: 96.6 },
        lines: 99.5,
        statements: 99,
        functions: 98.5,
        branches: 92.5,
      },
    },
  },
}))
