// The demo diary behind `node scripts/seed.mjs`: 60 days logged the way the tester logs, for screenshot reviews and
// upgrade rehearsals. Only type imports, so Node runs this file as it is (type stripping): what it needs from the app
// comes in as arguments. seed.test.ts holds it to the current export format.
import type { ExportFile } from '../lib/backup'
import type { FigureId, FigureView } from '../lib/figures'
import type { Entry, Layer, Preset, Stroke, Symptom, Tag } from '../lib/types'

type Figures = Record<FigureId, Record<FigureView, Record<string, [number, number][]>>>
export type SeedInput = { now: Date; figures: Figures; symptoms: Symptom[]; tags: Tag[] }

/** Bump with EXPORT_VERSION (a test says when): the seed writes the current format, never an old one. */
const VERSION = 10
const DAYS = 60
const MIN = 60_000
const HOUR = 60 * MIN

const LEGS = ['152', '153', '160', '161']
const LEGS_BACK = ['252', '253', '260', '261']
const LOWER_BACK = ['224', '225']
const BUTTOCKS = ['226', '227']
const NECK = ['104', '105', '130', '131']
const KNEES = ['154', '155']
const ARMS = ['132', '133', '140', '141']
const HEAD = ['100', '101', '102', '103']
const PLACES = [LEGS, LEGS, LEGS_BACK, LOWER_BACK, BUTTOCKS, NECK, KNEES, ARMS]
/** CHOIR codes of the segments that get paint (`figures.ts` keys), on both figures. */
const CHOIR: Record<string, { view: FigureView; code: string }> = {
  '152': { view: 'front', code: '127' },
  '224': { view: 'back', code: '218' },
  '226': { view: 'back', code: '223' },
}
const NOTES = ['Giornata pesante, gambe gonfie la sera.', 'Dopo la camminata va meglio.', 'Notte agitata.', 'Caldo, peggio del solito.']

/** One update of an episode: how long after the start, each layer's new levels, what was done then per layer. */
type Step = { after: number; readings: Record<string, number>[]; tags?: string[][] }

const byOrder = <T extends { id: string; order: number }>(a: T, b: T) => a.order - b.order || (a.id < b.id ? -1 : 1)

export function buildSeed({ now, figures, symptoms: baseSymptoms, tags: baseTags }: SeedInput): ExportFile {
  let state = 7
  const rnd = () => (state = (state * 16807) % 2147483647) / 2147483647
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]
  const level = (v: number) => Math.max(0, Math.min(10, Math.round(v)))
  const end = now.getTime() - 5 * MIN

  // The vocabulary as a person leaves it: one symptom renamed, one switched off after a month, one of their own;
  // their medications, a context of their own, a built-in tag switched off.
  const ownSymptoms: Symptom[] = [{ id: 'own-nausea', label: 'Nausea', category: 'body', enabled: true, order: 9 }]
  const symptoms = [
    ...baseSymptoms.map((s) => (s.id === 'heaviness' ? { ...s, label: 'Gambe pesanti' } : s.id === 'stiffness' ? { ...s, enabled: false } : { ...s })),
    ...ownSymptoms,
  ].sort(byOrder)
  const ownTags: Tag[] = [
    { id: 'own-shift', label: 'Turno lungo', group: 'context', enabled: true, order: 18 },
    { id: 'own-ibuprofen', label: 'Ibuprofene', group: 'medication', enabled: true, order: 20 },
    { id: 'own-paracetamol', label: 'Paracetamolo', group: 'medication', enabled: true, order: 21 },
  ]
  const tags = [...baseTags.map((t) => (t.id === 'travel' ? { ...t, enabled: false } : { ...t })), ...ownTags].sort(byOrder)

  /** A short shaded squiggle around the middle of a segment, every point inside it (§5.3). */
  const stroke = (region: string, fig: FigureId): Stroke => {
    const { view, code } = CHOIR[region]
    const poly = figures[fig][view][code]
    const cx = poly.reduce((t, p) => t + p[0], 0) / poly.length
    const cy = poly.reduce((t, p) => t + p[1], 0) / poly.length
    const r1 = (v: number) => Math.round(v * 10) / 10
    const points = [0, 1, 2].map((i): [number, number] => [r1(cx - 1 + i + (rnd() - 0.5)), r1(cy - 2 + i * 2 + (rnd() - 0.5))])
    return { region, fig, view, points, w: 8 }
  }

  const presets: Preset[] = [
    { id: 'seed-preset-legs', name: 'Gambe', kind: 'chronic', order: 0, layers: [{ regions: LEGS, asks: ['pain', 'swelling', 'heaviness'] }] },
    { id: 'seed-preset-back', name: 'Schiena', kind: 'chronic', order: 1, layers: [{ regions: LOWER_BACK, asks: ['pain'], strokes: [stroke('224', 'female')] }] },
    {
      id: 'seed-preset-migraine',
      name: 'Emicrania',
      kind: 'episode',
      order: 2,
      layers: [
        { regions: HEAD, asks: ['pain', 'own-nausea'] },
        { regions: ['mind'], asks: ['fog'] },
      ],
    },
  ]

  const entries: Entry[] = []
  let n = 0
  const iso = (t: number) => new Date(t).toISOString()
  const layer = (regions: string[], readings: Record<string, number>, tags: string[] = [], strokes?: Stroke[]): Layer => ({
    regions,
    readings,
    tags,
    ...(strokes ? { strokes } : {}),
  })
  const add = (e: Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>, updatedAt = e.at): Entry => {
    const entry = { id: `seed-${String(++n).padStart(3, '0')}`, ...e, createdAt: e.at, updatedAt } as Entry
    entries.push(entry)
    return entry
  }
  /** An episode: the start, then each update from where it stands (§5.5), then the end unless it is still going on. */
  const episode = (start: number, head: Layer[], steps: Step[], endAfter: number | null, presetId?: string, note = '') => {
    const endedAt = endAfter === null ? null : iso(start + endAfter)
    const h = add({ kind: 'episode', at: iso(start), layers: head, note, endedAt, ...(presetId ? { presetId } : {}) }, endedAt ?? iso(start))
    h.episodeId = h.id
    let from = head
    for (const s of steps) {
      from = from.map((l, i) => layer(l.regions, { ...l.readings, ...s.readings[i] }, s.tags?.[i] ?? [], l.strokes))
      add({ kind: 'episode', episodeId: h.id, at: iso(start + s.after), layers: from, note: '' })
    }
  }

  const day0 = new Date(now)
  day0.setHours(0, 0, 0, 0)
  for (let d = DAYS - 1; d >= 0; d--) {
    const day = day0.getTime() - d * 24 * HOUR
    const at = (h: number, m = int(0, 59)) => day + h * HOUR + m * MIN
    const stiff = d >= 30 // switched off a month ago: its readings stay in history

    // A migraine about once a week, from its preset: worst at the start, eased by a pill, over in a few hours.
    if (d % 7 === 3) {
      const start = at(int(14, 18))
      const pain = int(6, 9)
      const steps: Step[] = [
        { after: int(40, 70) * MIN, readings: [{ pain: pain - 1, 'own-nausea': int(2, 4) }, { fog: int(3, 5) }], tags: [['own-ibuprofen'], []] },
        { after: int(2, 3) * HOUR, readings: [{ pain: level(pain - 4), 'own-nausea': int(1, 3) }, { fog: int(2, 3) }] },
        ...(rnd() < 0.5 ? [{ after: int(4, 5) * HOUR, readings: [{ pain: int(1, 2), 'own-nausea': 0 }, { fog: int(1, 2) }], tags: [['own-paracetamol'], []] }] : []),
      ]
      const last = steps[steps.length - 1].after
      if (start + last + HOUR < end) {
        episode(start, [layer(HEAD, { pain, 'own-nausea': int(2, 4) }, ['badsleep']), layer(['mind'], { fog: int(3, 5) })], steps, last + int(30, 90) * MIN, 'seed-preset-migraine', rnd() < 0.4 ? 'Luce fastidiosa, buio e silenzio.' : '')
      }
    }

    // A flare of the legs every ten days or so, logged by hand: swelling and pain through the evening.
    if (d % 10 === 6) {
      const start = at(int(17, 19))
      const pain = int(5, 8)
      const strokes = rnd() < 0.5 ? [stroke('152', 'female')] : undefined
      episode(
        start,
        [layer(LEGS, { pain, swelling: int(5, 8), heaviness: int(4, 7) }, ['standing', ...(rnd() < 0.5 ? ['hot_weather'] : [])], strokes)],
        [
          { after: int(60, 90) * MIN, readings: [{ pain: pain - 1, swelling: int(4, 6) }], tags: [['compression']] },
          { after: int(3, 4) * HOUR, readings: [{ pain: level(pain - 3), swelling: int(2, 4), heaviness: int(2, 4) }], tags: [['mld']] },
        ],
        int(4, 5) * HOUR + 30 * MIN,
      )
    }

    // Snapshots through the day: mostly from a preset, else by hand.
    const count = rnd() < 0.15 ? 0 : 1 + (rnd() < 0.45 ? 1 : 0)
    for (let k = 0; k < count; k++) {
      const t = at(k === 0 ? int(8, 12) : int(19, 22))
      if (t >= end) continue
      const bad = rnd() < 0.3
      const pain = bad ? int(5, 8) : int(0, 4)
      if (rnd() < 0.5) {
        // From a preset: its places and the sliders it asks, no tags, no note (§5.6).
        if (rnd() < 0.6) add({ kind: 'chronic', at: iso(t), presetId: 'seed-preset-legs', note: '', layers: [layer(LEGS, { pain, swelling: level(pain + int(-1, 2)), heaviness: level(pain + int(-2, 1)) })] })
        else add({ kind: 'chronic', at: iso(t), presetId: 'seed-preset-back', note: '', layers: [layer(LOWER_BACK, { pain }, [], presets[1].layers[0].strokes)] })
        continue
      }
      // By hand: nothing at all now and then, a place or two, the head beside the body, the whole body on a bad day.
      const ctx = ['stress', 'badsleep', 'period', 'sitting', 'own-shift', ...(d >= 40 ? ['travel'] : [])].filter(() => rnd() < 0.15)
      const done = ['exercise', 'rest', 'heat', 'stretching', 'meditation'].filter(() => rnd() < 0.12)
      const note = rnd() < 0.15 ? pick(NOTES) : ''
      if (!bad && rnd() < 0.12) {
        add({ kind: 'chronic', at: iso(t), note, layers: [layer([], { pain: 0, fatigue: int(1, 4) }, ctx)] })
        continue
      }
      if (bad && rnd() < 0.15) {
        add({ kind: 'chronic', at: iso(t), note: note || 'Male dappertutto.', layers: [layer(['*'], { pain, fatigue: int(6, 9), ...(stiff ? { stiffness: int(5, 8) } : {}) }, [...ctx, ...done])] })
        continue
      }
      const place = pick(PLACES)
      const paint = place === BUTTOCKS && rnd() < 0.7 ? [stroke('226', rnd() < 0.5 ? 'male' : 'female')] : undefined
      const body: Record<string, number> = { pain }
      if (rnd() < 0.5) body.swelling = int(1, 7)
      if (rnd() < 0.3) body.fatigue = int(2, 8)
      if (stiff && rnd() < 0.3) body.stiffness = int(2, 7)
      const layers = [layer([...place], body, [...ctx, ...done], paint)]
      if (rnd() < 0.25) layers.push(layer(place === KNEES ? LOWER_BACK : KNEES, { pain: level(pain - int(1, 3)) }))
      if (rnd() < 0.3) {
        const mind: Record<string, number> = {}
        if (rnd() < 0.7) mind.fog = int(2, 8)
        if (rnd() < 0.5) mind.anxiety = int(2, 8)
        if (rnd() < 0.3) mind.depression = int(2, 7)
        if (Object.keys(mind).length) layers.push(layer(['mind'], mind))
      }
      add({ kind: 'chronic', at: iso(t), note, layers })
    }
  }

  // One episode going on right now: the back since this morning, eased a little since.
  episode(
    end - 3 * HOUR,
    [layer([...LOWER_BACK, ...BUTTOCKS], { pain: 7, fatigue: 6 }, ['sitting'], [stroke('226', 'male')])],
    [
      { after: 75 * MIN, readings: [{ pain: 6 }], tags: [['heat']] },
      { after: 150 * MIN, readings: [{ pain: 5, fatigue: 4 }], tags: [['own-ibuprofen']] },
    ],
    null,
  )

  entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1))
  return { app: 'gom-jabbar', version: VERSION, exportedAt: now.toISOString(), vocabulary: { symptoms, tags }, entries, presets }
}
