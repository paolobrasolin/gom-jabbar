// Fails when the gzipped JS shipped to the phone exceeds the budget from SPEC.md §12: every script in the build, the
// service worker and its Workbox runtime included. Reads the dist/ next to this script, wherever it is run from.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 150
const dist = fileURLToPath(new URL('../dist/', import.meta.url))
let total = 0
for (const f of readdirSync(dist, { recursive: true }).sort()) {
  if (!f.endsWith('.js')) continue
  const gz = gzipSync(readFileSync(dist + f)).length
  total += gz
  console.log(`${f}: ${(gz / 1024).toFixed(1)} KB gzipped`)
}
console.log(`total JS: ${(total / 1024).toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB)`)
if (total > BUDGET_KB * 1024) {
  console.error('over budget')
  process.exit(1)
}
