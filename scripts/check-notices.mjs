// Fails when dist/open-source-licences.html misses a package the build ships (#35, #117). The app bundle's packages come
// from the module graph; what a plugin writes into the output itself is not in it, so it is checked here by its
// signature: the service worker's Workbox modules (by the names they announce), the AMD loader the service worker
// begins with, and Vite's runtime helpers (they ask whether the browser knows modulepreload). Each must be listed
// (OUTPUT_PACKAGES in vite.config.ts), or gone.
import { readdirSync, readFileSync } from 'node:fs'

const notices = readFileSync('dist/open-source-licences.html', 'utf8')
const listed = new Set([...notices.matchAll(/<h2 id="[^"]*">(\S+) \S+ — /g)].map((m) => m[1]))
const shipped = new Set()
const workbox = readdirSync('dist').filter((f) => /^workbox-.*\.js$/.test(f))
for (const f of workbox) for (const m of readFileSync(`dist/${f}`, 'utf8').matchAll(/workbox:([a-z-]+):/g)) shipped.add(`workbox-${m[1]}`)
if (!shipped.size) {
  console.error('no Workbox runtime found in dist: has the PWA build changed?')
  process.exit(1)
}
// The loader rollup-plugin-off-main-thread puts at the top of sw.js: "If the loader is already loaded, just stop."
if (/^if\(!self\.define\)/.test(readFileSync('dist/sw.js', 'utf8'))) shipped.add('@trickfilm400/rollup-plugin-off-main-thread')
const assets = readdirSync('dist/assets').filter((f) => f.endsWith('.js'))
// Vite's modulepreload polyfill and the preload helper of a dynamic import both ask the browser this.
if (assets.some((f) => /supports\([`"']modulepreload[`"']\)/.test(readFileSync(`dist/assets/${f}`, 'utf8')))) shipped.add('vite')
const missing = [...shipped].filter((p) => !listed.has(p))
console.log(`open-source-licences.html: ${listed.size} packages; written into the output by plugins: ${[...shipped].join(', ')}`)
if (missing.length) {
  console.error(`missing from open-source-licences.html (add to OUTPUT_PACKAGES in vite.config.ts, or keep it out of the build): ${missing.join(', ')}`)
  process.exit(1)
}
