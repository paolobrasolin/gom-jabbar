import { describe, it, expect } from 'vitest'
import { VIEWBOX, REGIONS, regionsFor, limbOf, shapeCenter, pathFor, shapeArea, mirrorId, toggleRegion, toggleSet, toggleFullBody, summarizeRegions, LEG_IDS, ARM_IDS, FULL_BODY } from './regions'

describe('regions', () => {
  it('has front and back views with sided regions', () => {
    expect(regionsFor('front').length).toBeGreaterThan(20)
    expect(regionsFor('back').length).toBeGreaterThan(20)
    expect(REGIONS.some((r) => r.id === 'thigh.l')).toBe(true)
    expect(REGIONS.some((r) => r.id === 'calf.r')).toBe(true)
  })

  it('front view puts the figure right side on the viewer left', () => {
    const r = regionsFor('front').find((x) => x.id === 'thigh.r')!
    const l = regionsFor('front').find((x) => x.id === 'thigh.l')!
    const cx = (s: typeof r.shape) => shapeCenter(s)[0]
    expect(cx(r.shape)).toBeLessThan(VIEWBOX.w / 2)
    expect(cx(l.shape)).toBeGreaterThan(VIEWBOX.w / 2)
    const br = regionsFor('back').find((x) => x.id === 'calf.r')!
    expect(cx(br.shape)).toBeGreaterThan(VIEWBOX.w / 2)
  })

  it('builds closed paths and areas for every shape', () => {
    for (const r of REGIONS) {
      expect(pathFor(r.shape)).toMatch(/^M .* Z$/)
      expect(shapeArea(r.shape)).toBeGreaterThan(100)
    }
    expect(shapeArea({ kind: 'poly', points: [[0, 0], [10, 0], [10, 10], [0, 10]], r: 2 })).toBe(100)
  })

  it('mirrors ids', () => {
    expect(mirrorId('thigh.l')).toBe('thigh.r')
    expect(mirrorId('calf.r')).toBe('calf.l')
    expect(mirrorId('chest')).toBeNull()
  })

  it('toggles with and without mirror', () => {
    expect(toggleRegion([], 'thigh.l', true)).toEqual(['thigh.l', 'thigh.r'])
    expect(toggleRegion([], 'thigh.l', false)).toEqual(['thigh.l'])
    expect(toggleRegion(['thigh.l', 'thigh.r'], 'thigh.l', true)).toEqual([])
    expect(toggleRegion(['chest'], 'chest', true)).toEqual([])
  })

  it('toggles sets', () => {
    const legs = toggleSet([], LEG_IDS)
    expect(legs).toEqual([...LEG_IDS].sort())
    expect(toggleSet(legs, LEG_IDS)).toEqual([])
    expect(toggleSet(['chest'], ARM_IDS)).toContain('chest')
  })

  it('full body overrides everything', () => {
    expect(toggleFullBody(['thigh.l'])).toEqual([FULL_BODY])
    expect(toggleFullBody([FULL_BODY])).toEqual([])
    expect(toggleRegion([FULL_BODY], 'thigh.l', true)).toEqual([FULL_BODY])
  })

  it('draws hips on the outer edge of the pelvis and a pelvis in the middle', () => {
    const front = regionsFor('front')
    const hip = front.find((x) => x.id === 'hip.r')!
    const thigh = front.find((x) => x.id === 'thigh.r')!
    const abdomen = front.find((x) => x.id === 'abdomen')!
    const pelvis = front.find((x) => x.id === 'pelvis')!
    // hip.r is on the viewer's left: its centre sits further out than the thigh's.
    expect(shapeCenter(hip.shape)[0]).toBeLessThan(shapeCenter(thigh.shape)[0])
    if (hip.shape.kind === 'poly') expect(Math.max(...hip.shape.points.map((p) => p[0]))).toBeLessThan(VIEWBOX.w / 2 - 12)
    expect(pelvis.side).toBeUndefined()
    expect(pelvis.group).toBe('torso')
    expect(shapeCenter(pelvis.shape)[0]).toBeCloseTo(VIEWBOX.w / 2, 5)
    expect(shapeCenter(pelvis.shape)[1]).toBeGreaterThan(shapeCenter(abdomen.shape)[1])
    expect(shapeCenter(pelvis.shape)[1]).toBeLessThan(shapeCenter(thigh.shape)[1])
    expect(LEG_IDS).toContain('hip.l')
    expect(LEG_IDS).not.toContain('pelvis')
    expect(limbOf('pelvis')).toEqual(['abdomen', 'chest', 'pelvis'])
    expect(summarizeRegions(['pelvis'])).toEqual([{ group: 'torso', side: 'none' }])
  })

  it('limbOf selects the whole limb on one side, both views', () => {
    const leg = limbOf('thigh.l')
    expect(leg).toContain('hip.l')
    expect(leg).toContain('calf.l')
    expect(leg).toContain('foot.l')
    expect(leg).not.toContain('thigh.r')
    expect(limbOf('shoulder.r')).toEqual(expect.arrayContaining(['hand.r', 'elbow.r', 'forearm.back.r']))
    expect(limbOf('chest')).toEqual(['abdomen', 'chest', 'pelvis'])
    expect(limbOf('neck.back')).toEqual(['head', 'head.back', 'neck', 'neck.back'])
  })

  it('summarizes into coarse groups with sides', () => {
    expect(summarizeRegions([FULL_BODY])).toEqual([{ group: 'full', side: 'none' }])
    expect(summarizeRegions(['thigh.l', 'thigh.r', 'chest', 'hand.l'])).toEqual([
      { group: 'arm', side: 'l' },
      { group: 'torso', side: 'none' },
      { group: 'leg', side: 'both' },
    ])
  })
})

describe('shape helpers', async () => {
  const R = await import('./regions')
  it('centres an ellipse on its origin', () => {
    expect(R.shapeCenter({ kind: 'ellipse', cx: 10, cy: 20, rx: 5, ry: 3 })).toEqual([10, 20])
  })
})
