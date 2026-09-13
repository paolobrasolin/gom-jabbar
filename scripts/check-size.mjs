// Fails when the gzipped JS shipped to the phone exceeds the budget from SPEC.md §12.
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 150
const dir = 'dist/assets'
let total = 0
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.js')) continue
  const gz = gzipSync(readFileSync(`${dir}/${f}`)).length
  total += gz
  console.log(`${f}: ${(gz / 1024).toFixed(1)} KB gzipped`)
}
console.log(`total JS: ${(total / 1024).toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB)`)
if (total > BUDGET_KB * 1024) {
  console.error('over budget')
  process.exit(1)
}
