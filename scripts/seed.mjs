// Generates a demo export file (60 days of plausible entries) for testing trends and the report.
// Usage: node scripts/seed.mjs [out.json]   then Settings → Importa → Sostituisci tutto.
import { writeFileSync } from 'node:fs'

const out = process.argv[2] ?? 'seed.json'
const regionSets = [
  ['152', '153', '160', '161', '150', '151'],
  ['152', '153', '154', '155'],
  ['130', '131', '104'],
  ['224', '226', '227'],
  ['*'],
  ['140', '141', '144', '145'],
]
const tagPool = ['compression', 'mld', 'exercise', 'rest', 'heat', 'period', 'stress', 'badsleep', 'standing', 'sitting', 'hot_weather']
let seed = 7
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647

const entries = []
const now = new Date()
now.setHours(12, 0, 0, 0)
for (let d = 59; d >= 0; d--) {
  if (rnd() < 0.2) continue
  const n = 1 + (rnd() < 0.4 ? 1 : 0)
  for (let k = 0; k < n; k++) {
    const at = new Date(now)
    at.setDate(now.getDate() - d)
    at.setHours(8 + Math.floor(rnd() * 12), Math.floor(rnd() * 60))
    const bad = rnd() < 0.35
    const tags = tagPool.filter(() => rnd() < 0.18)
    if (bad && rnd() < 0.6) tags.push('badsleep')
    const base = bad ? 6 + Math.floor(rnd() * 4) : 2 + Math.floor(rnd() * 4)
    const areas = [{ regions: regionSets[Math.floor(rnd() * regionSets.length)], intensity: base }]
    if (rnd() < 0.3) areas.push({ regions: regionSets[2], intensity: Math.max(1, base - 3) })
    const episode = rnd() < 0.3
    const endedAt = episode ? new Date(at.getTime() + (1 + rnd() * 6) * 3600e3).toISOString() : null
    const readings = { pain: Math.max(...areas.map((a) => a.intensity)) }
    if (rnd() < 0.5) readings.swelling = 2 + Math.floor(rnd() * 6)
    if (rnd() < 0.4) readings.fatigue = 3 + Math.floor(rnd() * 6)
    // The mind (§5.3): a foggy, anxious or low head beside the body now and then, alone in its area at the highest mind level.
    if (rnd() < 0.3) {
      if (rnd() < 0.7) readings.fog = 2 + Math.floor(rnd() * 7)
      if (rnd() < 0.5) readings.anxiety = 2 + Math.floor(rnd() * 7)
      if (rnd() < 0.3) readings.depression = 2 + Math.floor(rnd() * 6)
      const mind = Math.max(readings.fog ?? 0, readings.anxiety ?? 0, readings.depression ?? 0)
      if (mind > 0) areas.push({ regions: ['mind'], intensity: mind })
    }
    const iso = at.toISOString()
    entries.push({
      id: `seed-${d}-${k}`,
      at: iso,
      endedAt,
      ongoing: false,
      readings,
      areas,
      tags: [...new Set(tags)],
      note: rnd() < 0.15 ? 'Giornata pesante, gambe gonfie la sera.' : '',
      createdAt: iso,
      updatedAt: iso,
    })
  }
}
writeFileSync(out, JSON.stringify({ app: 'gom-jabbar', version: 2, exportedAt: new Date().toISOString(), vocabulary: { symptoms: [], tags: [] }, entries }, null, 1))
console.log(`${entries.length} entries → ${out}`)
