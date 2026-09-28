// Fails when dist/licenses.txt misses a package the build ships (#35). The app bundle's packages come from the
// module graph and cannot be missed; the service worker's runtime is listed by hand in vite.config.ts (SW_PACKAGES),
// so this checks it against the Workbox modules the generated runtime actually announces.
import { readdirSync, readFileSync } from 'node:fs'

const notices = readFileSync('dist/licenses.txt', 'utf8')
const listed = new Set([...notices.matchAll(/^(\S+) \S+ — /gm)].map((m) => m[1]))
const shipped = new Set()
for (const f of readdirSync('dist').filter((f) => /^workbox-.*\.js$/.test(f)))
  for (const m of readFileSync(`dist/${f}`, 'utf8').matchAll(/workbox:([a-z-]+):/g)) shipped.add(`workbox-${m[1]}`)
const missing = [...shipped].filter((p) => !listed.has(p))
console.log(`licenses.txt: ${listed.size} packages; service worker runtime: ${[...shipped].join(', ') || 'none found'}`)
if (!shipped.size) {
  console.error('no Workbox runtime found in dist: has the PWA build changed?')
  process.exit(1)
}
if (missing.length) {
  console.error(`missing from licenses.txt (add to SW_PACKAGES in vite.config.ts): ${missing.join(', ')}`)
  process.exit(1)
}
