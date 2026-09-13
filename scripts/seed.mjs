// Generates a demo export file (60 days of plausible entries) for testing trends and the report.
// Usage: node scripts/seed.mjs [out.json]   then Settings → Importa → Sostituisci tutto.
import { writeFileSync } from 'node:fs'

const out = process.argv[2] ?? 'seed.json'
const regionSets = [
  ['thigh.l', 'thigh.r', 'shin.l', 'shin.r', 'hip.l', 'hip.r'],
  ['thigh.l', 'thigh.r', 'knee.l', 'knee.r'],
  ['shoulder.l', 'shoulder.r', 'neck'],
  ['lowerback', 'buttock.l', 'buttock.r'],
  ['*'],
  ['forearm.l', 'forearm.r', 'hand.l', 'hand.r'],
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
