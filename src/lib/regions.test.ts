import { describe, it, expect } from 'vitest'
import {
  REGIONS, REGION_BY_ID, regionsFor, shapeOf, figureBox, limbOf, shapeCenter, pathFor, shapeArea, mirrorId, toggleRegion, toggleSet, toggleFullBody,
  summarizeRegions, upgradeRegions, LEGACY_REGIONS, LEG_IDS, ARM_IDS, FULL_BODY, MIND, MIND_SHAPE, isMind,
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
    expect(pathFor({ kind: 'ellipse', cx: 5, cy: 5, rx: 2, ry: 1 })).toMatch(/^M 3 5 a 2 1/)
    expect(shapeArea({ kind: 'ellipse', cx: 0, cy: 0, rx: 1, ry: 1 })).toBeCloseTo(Math.PI)
    expect(shapeCenter({ kind: 'ellipse', cx: 3, cy: 4, rx: 1, ry: 1 })).toEqual([3, 4])
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

  it('limbOf selects the whole limb on one side, both views; the trunk stays on its view', () => {
    const leg = limbOf('152')
    expect(leg).toEqual(['150', '152', '154', '160', '162', '164', '250', '252', '254', '260', '262', '264'])
    expect(limbOf('131')).toEqual(['131', '133', '135', '141', '143', '145', '231', '233', '235', '241', '243', '245'])
    expect(limbOf('110')).toEqual(['110', '112', '114'])
    expect(limbOf('221')).toEqual(['221', '223', '225', '227'])
    expect(limbOf('104')).toEqual(['100', '102', '104', '200', '202', '204'])
    expect(limbOf('nope')).toEqual(['nope'])
  })

  it('summarizes into coarse groups with sides', () => {
    expect(summarizeRegions([FULL_BODY])).toEqual([{ group: 'full', side: 'none' }])
    expect(summarizeRegions(['152', '153', '150'])).toEqual([{ group: 'hip', side: 'l' }, { group: 'leg', side: 'both' }])
    expect(summarizeRegions(['131', '110'])).toEqual([{ group: 'arm', side: 'r' }, { group: 'torso', side: 'l' }])
    expect(summarizeRegions(['nope'])).toEqual([])
    expect(summarizeRegions([MIND])).toEqual([{ group: 'mind', side: 'none' }])
    expect(summarizeRegions(['152', MIND])).toEqual([{ group: 'mind', side: 'none' }, { group: 'leg', side: 'l' }])
  })

  it('the mind is a region of its own, not a CHOIR segment: no side, no mirror, no limb, its own shape', () => {
    expect(isMind(MIND)).toBe(true)
    expect(isMind('152')).toBe(false)
    expect(REGION_BY_ID[MIND]).toBeUndefined()
    expect(mirrorId(MIND)).toBeNull()
    expect(limbOf(MIND)).toEqual([MIND])
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
