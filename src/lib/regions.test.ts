import { describe, it, expect } from 'vitest'
import {
  REGIONS, REGION_BY_ID, regionsFor, shapeOf, figureBox, shapeCenter, pathFor, shapeArea, mirrorId, flipId, counterparts, toggleRegion, toggleSet, toggleFullBody,
  summarizeRegions, upgradeRegions, LEGACY_REGIONS, LEG_IDS, ARM_IDS, HEAD_IDS, TORSO_IDS, sided, viewBox, FULL_BODY, MIND, MIND_SHAPE, isMind, onFigure,
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
    expect(REGION_BY_ID['152']).toMatchObject({ view: 'front', name: 'thigh', side: 'l', group: 'leg', choir: 127 })
    expect(REGION_BY_ID['153']).toMatchObject({ name: 'thigh', side: 'r', choir: 126 })
    expect(REGION_BY_ID['254']).toMatchObject({ view: 'back', name: 'knee.back', side: 'l', choir: 231 })
    expect(REGION_BY_ID['110']).toMatchObject({ name: 'chest', group: 'torso', side: 'l', choir: 109 })
    expect(REGION_BY_ID['227']).toMatchObject({ name: 'buttock', group: 'hip', side: 'r', choir: 224 })
    expect(REGION_BY_ID['142']).toMatchObject({ name: 'wrist', choir: 124 })
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

  it('summarizes into coarse groups with sides', () => {
    expect(summarizeRegions([FULL_BODY])).toEqual([{ group: 'full', side: 'none' }])
    expect(summarizeRegions(['152', '153', '150'])).toEqual([{ group: 'hip', side: 'l' }, { group: 'leg', side: 'both' }])
    expect(summarizeRegions(['131', '110'])).toEqual([{ group: 'arm', side: 'r' }, { group: 'torso', side: 'l' }])
    expect(summarizeRegions(['nope'])).toEqual([])
    expect(summarizeRegions([MIND])).toEqual([{ group: 'mind', side: 'none' }])
    expect(summarizeRegions(['152', MIND])).toEqual([{ group: 'leg', side: 'l' }, { group: 'mind', side: 'none' }])
    expect(summarizeRegions([MIND, FULL_BODY])).toEqual([{ group: 'full', side: 'none' }, { group: 'mind', side: 'none' }])
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
  it('head and torso cover their families on both views; a side keeps one side of a limb', () => {
    expect(HEAD_IDS).toHaveLength(12)
    expect(HEAD_IDS).toEqual(expect.arrayContaining(['100', '105', '200', '205']))
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
  it('flips the view digit for a limb or the head, never for the trunk, and never for what does not exist', () => {
    expect(flipId('152')).toBe('252')
    expect(flipId('252')).toBe('152')
    expect(flipId('100')).toBe('200')
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
