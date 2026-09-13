import { describe, it, expect } from 'vitest'
import { VIEWBOX, REGIONS, regionsFor, mirrorId, toggleRegion, toggleSet, toggleFullBody, summarizeRegions, LEG_IDS, ARM_IDS, FULL_BODY } from './regions'

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
    const cx = (s: typeof r.shape) => (s.kind === 'rect' ? s.x + s.w / 2 : s.cx)
    expect(cx(r.shape)).toBeLessThan(VIEWBOX.w / 2)
    expect(cx(l.shape)).toBeGreaterThan(VIEWBOX.w / 2)
    const br = regionsFor('back').find((x) => x.id === 'calf.r')!
    expect(cx(br.shape)).toBeGreaterThan(VIEWBOX.w / 2)
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

  it('summarizes into coarse groups with sides', () => {
    expect(summarizeRegions([FULL_BODY])).toEqual([{ group: 'full', side: 'none' }])
    expect(summarizeRegions(['thigh.l', 'thigh.r', 'chest', 'hand.l'])).toEqual([
      { group: 'arm', side: 'l' },
      { group: 'torso', side: 'none' },
      { group: 'leg', side: 'both' },
    ])
  })
})
