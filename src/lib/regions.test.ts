import { describe, it, expect } from 'vitest'
import {
  REGIONS, REGION_BY_ID, regionsFor, shapeOf, figureBox, shapeCenter, pathFor, shapeArea, mirrorId, flipId, counterparts, toggleRegion, toggleSet, toggleFullBody,
  upgradeRegions, LEGACY_REGIONS, LEG_IDS, ARM_IDS, HEAD_IDS, TORSO_IDS, sided, viewBox, FULL_BODY, MIND, MIND_SHAPE, isMind, onFigure,
} from './regions'

describe('region codes', () => {
  it('cover the 74 CHOIR segments once each: 36 front, 38 back', () => {
    expect(regionsFor('front')).toHaveLength(36)
    expect(regionsFor('back')).toHaveLength(38)
    const front = regionsFor('front').map((r) => r.choir).sort((a, b) => a - b)
    const back = regionsFor('back').map((r) => r.choir).sort((a, b) => a - b)
    expect(front).toEqual(Array.from({ length: 36 }, (_, i) => 101 + i))
    expect(back).toEqual(Array.from({ length: 38 }, (_, i) => 201 + i))
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(74)
  })

  it('read as view, family, part and side: 1 front 2 back; even left, odd right', () => {
    for (const r of REGIONS) {
      expect(r.id).toMatch(/^[12][0-6]\d$/)
      expect(r.id[0]).toBe(r.view === 'front' ? '1' : '2')
      expect(r.side).toBe(Number(r.id) % 2 === 0 ? 'l' : 'r')
    }
    expect(REGION_BY_ID['152']).toMatchObject({ view: 'front', name: 'thigh', word: 'thigh', side: 'l', choir: 127 })
    expect(REGION_BY_ID['153']).toMatchObject({ name: 'thigh', side: 'r', choir: 126 })
    expect(REGION_BY_ID['254']).toMatchObject({ view: 'back', name: 'knee.back', word: 'kneeBack', side: 'l', choir: 231 })
    expect(REGION_BY_ID['110']).toMatchObject({ name: 'chest', word: 'chest', side: 'l', choir: 109 })
    expect(REGION_BY_ID['227']).toMatchObject({ name: 'buttock', word: 'buttock', side: 'r', choir: 224 })
    expect(REGION_BY_ID['142']).toMatchObject({ name: 'wrist', choir: 124 })
    expect(REGION_BY_ID['244']).toMatchObject({ name: 'hand.back', word: 'hand' })
  })

  it('the figure has the left side on the viewer right in front, on the viewer left at the back, on both silhouettes', () => {
    for (const fig of ['female', 'male'] as const) {
      const cx = (id: string) => shapeCenter(shapeOf(fig, REGION_BY_ID[id]))[0]
      const mid = figureBox(fig).w / 2
      expect(cx('152')).toBeGreaterThan(mid)
      expect(cx('153')).toBeLessThan(mid)
      expect(cx('252')).toBeLessThan(mid)
      expect(cx('253')).toBeGreaterThan(mid)
      expect(cx('144')).toBeGreaterThan(cx('141'))
    }
  })

  it('builds closed paths and areas for every shape on both figures', () => {
    for (const fig of ['female', 'male'] as const) {
      for (const r of REGIONS) {
        const s = shapeOf(fig, r)
        expect(pathFor(s)).toMatch(/^M .* Z$/)
        expect(shapeArea(s), `${fig} ${r.id}`).toBeGreaterThan(30)
      }
    }
    expect(shapeArea({ kind: 'poly', points: [[0, 0], [10, 0], [10, 10], [0, 10]], r: 2 })).toBe(100)
  })

  it('mirrors by flipping the parity', () => {
    expect(mirrorId('152')).toBe('153')
    expect(mirrorId('153')).toBe('152')
    expect(mirrorId('110')).toBe('111')
    expect(mirrorId('nope')).toBeNull()
  })

  it('toggles with and without mirror', () => {
    expect(toggleRegion([], '152', true)).toEqual(['152', '153'])
    expect(toggleRegion([], '152', false)).toEqual(['152'])
    expect(toggleRegion(['152', '153'], '152', true)).toEqual([])
    expect(toggleRegion([FULL_BODY], '152', true)).toEqual([FULL_BODY])
    expect(toggleSet([], ['152', '153'])).toEqual(['152', '153'])
    expect(toggleSet(['152', '153'], ['152', '153'])).toEqual([])
    expect(toggleSet([FULL_BODY], ['152'])).toEqual([FULL_BODY])
    expect(toggleFullBody([])).toEqual([FULL_BODY])
    expect(toggleFullBody([FULL_BODY])).toEqual([])
  })

  it('limb shortcuts: legs are families 5 and 6 with the hips, arms 3 and 4 with the hands, both views and sides', () => {
    expect(LEG_IDS).toHaveLength(24)
    expect(LEG_IDS).toEqual(expect.arrayContaining(['150', '151', '164', '250', '265']))
    expect(ARM_IDS).toHaveLength(24)
    expect(ARM_IDS).toEqual(expect.arrayContaining(['130', '145', '230', '245']))
    expect(LEG_IDS).not.toContain('114')
  })


  it('the mind is a region of its own, not a CHOIR segment: no side, no mirror, no limb, its own shape', () => {
    expect(isMind(MIND)).toBe(true)
    expect(isMind('152')).toBe(false)
    expect(REGION_BY_ID[MIND]).toBeUndefined()
    expect(mirrorId(MIND)).toBeNull()
    expect(LEG_IDS).not.toContain(MIND)
    expect(MIND_SHAPE.outline).toMatch(/^M .* Z$/)
    expect(MIND_SHAPE.seams).toMatch(/^M /)
    expect(upgradeRegions([MIND])).toEqual([MIND])
  })

  it('upgrades every pre-v5 id to codes that exist, unsided ones to both sides, hands to both views', () => {
    const OLD = [
      'head', 'neck', 'chest', 'abdomen', 'pelvis', 'upperback', 'lowerback', 'head.back', 'neck.back',
      ...['shoulder', 'upperarm', 'elbow', 'forearm', 'hand', 'hip', 'thigh', 'knee', 'shin', 'ankle', 'foot', 'buttock', 'shoulder.back', 'upperarm.back', 'elbow.back', 'forearm.back', 'thigh.back', 'knee.back', 'calf', 'heel', 'foot.back'].flatMap((b) => [`${b}.l`, `${b}.r`]),
    ]
    expect(Object.keys(LEGACY_REGIONS).sort()).toEqual([...OLD].sort())
    for (const codes of Object.values(LEGACY_REGIONS)) for (const c of codes) expect(REGION_BY_ID[c], c).toBeDefined()
    expect(upgradeRegions(['chest', 'thigh.l', 'hand.r'])).toEqual(['110', '111', '145', '152', '245'])
    expect(upgradeRegions(['*'])).toEqual(['*'])
    expect(upgradeRegions(['152', 'thigh.l'])).toEqual(['152'])
    // Every code the old front covered is a front code, and the back ones are back codes.
    for (const [old, codes] of Object.entries(LEGACY_REGIONS)) {
      const back = old.includes('back') || ['upperback', 'lowerback', 'buttock.l', 'buttock.r', 'calf.l', 'calf.r', 'heel.l', 'heel.r'].includes(old)
      for (const c of codes) if (!old.startsWith('hand')) expect(c[0], `${old} → ${c}`).toBe(back ? '2' : '1')
    }
  })
})

describe('onFigure', () => {
  it('is true on the skin of the view and false in the air around it', () => {
    const [x, y] = shapeCenter(shapeOf('female', REGION_BY_ID['152']))
    expect(onFigure('female', 'front', x, y)).toBe(true)
    // The middle of a back segment is skin on the back, air or another segment in front: the thigh's centre is skin on both.
    expect(onFigure('female', 'back', ...shapeCenter(shapeOf('female', REGION_BY_ID['252'])))).toBe(true)
    expect(onFigure('female', 'front', -50, -50)).toBe(false)
    expect(onFigure('male', 'front', 0, 0)).toBe(false)
  })
})

describe('quick sets', () => {
  it('head (without the neck) and torso cover their families on both views; a side keeps one side of a limb', () => {
    expect(HEAD_IDS).toHaveLength(8)
    expect(HEAD_IDS).toEqual(expect.arrayContaining(['100', '103', '200', '203']))
    expect(HEAD_IDS).not.toContain('104')
    expect(HEAD_IDS).not.toContain('205')
    expect(TORSO_IDS).toHaveLength(14)
    expect(TORSO_IDS).toEqual(expect.arrayContaining(['110', '115', '220', '227']))
    expect(sided(LEG_IDS, 'l')).toHaveLength(12)
    expect(sided(LEG_IDS, 'l').every((id) => Number(id) % 2 === 0)).toBe(true)
    expect(sided(ARM_IDS, 'r').every((id) => Number(id) % 2 === 1)).toBe(true)
    expect([...sided(ARM_IDS, 'l'), ...sided(ARM_IDS, 'r')].sort()).toEqual([...ARM_IDS].sort())
  })
})

describe('viewBox', () => {
  it('is the box the segments of that view fill, smaller than the figure box and different per view', () => {
    const fb = figureBox('female')
    const front = viewBox('female', 'front')
    const back = viewBox('female', 'back')
    expect(front.w).toBeLessThanOrEqual(fb.w)
    expect(front.h).toBeLessThanOrEqual(fb.h)
    expect(back).not.toEqual(front)
    // Every point of every segment lies in its view's box.
    for (const r of regionsFor('back')) {
      const s = shapeOf('female', r)
      for (const [x, y] of s.points) {
        expect(x).toBeGreaterThanOrEqual(back.x)
        expect(x).toBeLessThanOrEqual(back.x + back.w)
        expect(y).toBeGreaterThanOrEqual(back.y)
        expect(y).toBeLessThanOrEqual(back.y + back.h)
      }
    }
    expect(viewBox('female', 'back')).toBe(back)
  })
})

describe('the other view', () => {
  it('flips the view digit for a limb or the neck, never for the head or the trunk, and never for what does not exist', () => {
    expect(flipId('152')).toBe('252')
    expect(flipId('252')).toBe('152')
    expect(flipId('104')).toBe('204')
    expect(flipId('205')).toBe('105')
    // The front and back of the head are different places (#33): forehead and crown, face and back of the head.
    expect(flipId('100')).toBeNull()
    expect(flipId('203')).toBeNull()
    expect(flipId('110')).toBeNull()
    expect(flipId('226')).toBeNull()
    expect(flipId('nope')).toBeNull()
    expect(flipId(MIND)).toBeNull()
  })
  it('counterparts: the tap alone, its mirror, its other view, or all four', () => {
    expect(counterparts('152', {})).toEqual(['152'])
    expect(counterparts('152', { sides: true })).toEqual(['152', '153'])
    expect(counterparts('152', { views: true })).toEqual(['152', '252'])
    expect(counterparts('152', { sides: true, views: true })).toEqual(['152', '252', '153', '253'])
    // The trunk has no other view; the mirror still applies.
    expect(counterparts('110', { sides: true, views: true })).toEqual(['110', '111'])
  })
})

describe('the region table is user data', () => {
  // Entries store these ids. Each is frozen to its view, side, CHOIR code and name: reordering a row of FRONT or BACK in
  // regions.ts would renumber every region after it and silently move the tester's history. Add rows, never move them.
  it('every id keeps its view, side, CHOIR segment and name', () => {
    const frozen = `
      100 front l 102 head
      101 front r 101 head
      102 front l 104 face
      103 front r 103 face
      104 front l 106 neck
      105 front r 105 neck
      110 front l 109 chest
      111 front r 108 chest
      112 front l 117 abdomen
      113 front r 116 abdomen
      114 front l 122 groin
      115 front r 121 groin
      130 front l 110 shoulder
      131 front r 107 shoulder
      132 front l 112 upperarm
      133 front r 111 upperarm
      134 front l 114 elbow
      135 front r 113 elbow
      140 front l 118 forearm
      141 front r 115 forearm
      142 front l 124 wrist
      143 front r 119 wrist
      144 front l 128 hand
      145 front r 125 hand
      150 front l 123 hip
      151 front r 120 hip
      152 front l 127 thigh
      153 front r 126 thigh
      154 front l 130 knee
      155 front r 129 knee
      160 front l 132 shin
      161 front r 131 shin
      162 front l 134 ankle
      163 front r 133 ankle
      164 front l 136 foot
      165 front r 135 foot
      200 back l 201 head.back
      201 back r 202 head.back
      202 back l 203 nape
      203 back r 204 nape
      204 back l 205 neck.back
      205 back r 206 neck.back
      220 back l 208 upperback
      221 back r 209 upperback
      222 back l 212 midback
      223 back r 213 midback
      224 back l 218 lowerback
      225 back r 219 lowerback
      226 back l 223 buttock
      227 back r 224 buttock
      230 back l 207 shoulder.back
      231 back r 210 shoulder.back
      232 back l 211 upperarm.back
      233 back r 214 upperarm.back
      234 back l 215 elbow.back
      235 back r 216 elbow.back
      240 back l 217 forearm.back
      241 back r 220 forearm.back
      242 back l 221 wrist.back
      243 back r 226 wrist.back
      244 back l 227 hand.back
      245 back r 230 hand.back
      250 back l 222 hip.back
      251 back r 225 hip.back
      252 back l 228 thigh.back
      253 back r 229 thigh.back
      254 back l 231 knee.back
      255 back r 232 knee.back
      260 back l 233 calf
      261 back r 234 calf
      262 back l 235 heel
      263 back r 236 heel
      264 back l 237 foot.back
      265 back r 238 foot.back
    `.trim().split('\n').map((l) => l.trim())
    expect(REGIONS.map((r) => `${r.id} ${r.view} ${r.side} ${r.choir} ${r.name}`)).toEqual(frozen)
  })
})
