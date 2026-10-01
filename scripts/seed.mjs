// Writes a demo backup: 60 days logged the way the tester logs (src/test/seed.ts), in the current export format.
// Usage: node scripts/seed.mjs [out.json]   then Settings → Ripristina da file → Sostituisci tutto.
import { writeFileSync } from 'node:fs'
import { buildSeed } from '../src/test/seed.ts'
import { FIGURES } from '../src/lib/figures.ts'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from '../src/lib/vocabulary.ts'

const out = process.argv[2] ?? 'seed.json'
const seed = buildSeed({ now: new Date(), figures: FIGURES, symptoms: DEFAULT_SYMPTOMS, tags: DEFAULT_TAGS })
writeFileSync(out, JSON.stringify(seed, null, 1))
console.log(`${seed.entries.length} entries, ${seed.presets.length} presets → ${out}`)
