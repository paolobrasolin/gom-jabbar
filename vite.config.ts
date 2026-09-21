import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

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

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(`${pkg.version}+${gitRev()}`) },
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
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
        'src/lib/**': { lines: 99.3, statements: 98.6, functions: 97.4, branches: 94.2 },
        lines: 96.9,
        statements: 96.6,
        functions: 95.8,
        branches: 86.5,
      },
    },
  },
})
