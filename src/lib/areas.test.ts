import { describe, it, expect } from 'vitest'
import { tapRegion, tapSet, toggleFull, addArea, selectArea, setIntensity, finalize, overallPain, allRegions } from './areas'
import { LEG_IDS } from './regions'

const empty = { areas: [], cur: 0 }

describe('areas', () => {
  it('creates the first area on first tap with the brush level', () => {
    const s = tapRegion(empty, 'thigh.l', true, 6)
    expect(s.areas).toEqual([{ regions: ['thigh.l', 'thigh.r'], intensity: 6 }])
    expect(s.cur).toBe(0)
  })

  it('toggles a region off within the current area', () => {
    let s = tapRegion(empty, 'thigh.l', false, 5)
    s = tapRegion(s, 'thigh.l', false, 5)
    expect(s.areas).toEqual([{ regions: [], intensity: 5 }])
  })

  it('moves a region from another area into the current one', () => {
    let s = tapRegion(empty, 'thigh.l', false, 8)
    s = addArea(s, 8)
    s = setIntensity(s, 3)
    s = tapRegion(s, 'thigh.l', false, 3)
    expect(s.areas).toEqual([{ regions: ['thigh.l'], intensity: 3 }])
    expect(s.cur).toBe(0)
  })

  it('adds and selects areas, dropping empties', () => {
    let s = tapRegion(empty, 'chest', false, 4)
    s = addArea(s, 4)
    expect(s.areas).toHaveLength(2)
    expect(s.cur).toBe(1)
    s = selectArea(s, 0)
    expect(s.areas).toHaveLength(1)
    expect(s.cur).toBe(0)
    s = addArea(addArea(s, 4), 4)
    expect(s.areas).toHaveLength(2)
  })

  it('tapSet toggles a whole limb in the current area', () => {
    let s = tapSet(empty, LEG_IDS, 7)
    expect(s.areas[0].regions).toEqual([...LEG_IDS].sort())
    s = tapSet(s, LEG_IDS, 7)
    expect(s.areas[0].regions).toEqual([])
  })

  it('full body replaces all areas and blocks taps', () => {
    let s = tapRegion(empty, 'chest', false, 4)
    s = toggleFull(s, 9)
    expect(s.areas).toEqual([{ regions: ['*'], intensity: 4 }])
    expect(tapRegion(s, 'chest', false, 4)).toEqual(s)
    expect(toggleFull(s, 9).areas).toEqual([])
  })

  it('finalize and helpers', () => {
    const areas = finalize([{ regions: ['b', 'a', 'a'], intensity: 3.6 }, { regions: [], intensity: 9 }, { regions: ['*', 'x'], intensity: 11 }])
    expect(areas).toEqual([{ regions: ['a', 'b'], intensity: 4 }, { regions: ['*'], intensity: 10 }])
    expect(overallPain(areas, 1)).toBe(10)
    expect(overallPain([], 1)).toBe(1)
    expect(allRegions(areas)).toEqual(['*', 'a', 'b'])
  })
})

describe('areas edge cases', async () => {
  const A = await import('./areas')
  it('mirror on an unsided region adds only that region, and a set already present is removed', () => {
    const s = A.tapRegion({ areas: [], cur: 0 }, 'chest', true, 4)
    expect(s.areas).toEqual([{ regions: ['chest'], intensity: 4 }])
    const legs = A.tapSet({ areas: [], cur: 0 }, ['thigh.l', 'thigh.r'], 4)
    const off = A.tapSet(legs, ['thigh.l', 'thigh.r'], 4)
    expect(off.areas[0]?.regions ?? []).toEqual([])
  })
})
