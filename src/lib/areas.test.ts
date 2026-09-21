import { describe, it, expect } from 'vitest'
import { tapRegion, tapSet, toggleFull, setMindLevel, addArea, selectArea, setIntensity, finalize, overallPain, allRegions, mindOnly, hasMind, bodyAreas, isMindOnly } from './areas'
import { LEG_IDS, MIND } from './regions'

const empty = { areas: [], cur: 0 }

describe('areas', () => {
  it('creates the first area on first tap with the brush level', () => {
    const s = tapRegion(empty, '152', true, 6)
    expect(s.areas).toEqual([{ regions: ['152', '153'], intensity: 6 }])
    expect(s.cur).toBe(0)
  })

  it('toggles a region off within the current area', () => {
    let s = tapRegion(empty, '152', false, 5)
    s = tapRegion(s, '152', false, 5)
    expect(s.areas).toEqual([{ regions: [], intensity: 5 }])
  })

  it('moves a region from another area into the current one', () => {
    let s = tapRegion(empty, '152', false, 8)
    s = addArea(s, 8)
    s = setIntensity(s, 3)
    s = tapRegion(s, '152', false, 3)
    expect(s.areas).toEqual([{ regions: ['152'], intensity: 3 }])
    expect(s.cur).toBe(0)
  })

  it('adds and selects areas, dropping empties', () => {
    let s = tapRegion(empty, '110', false, 4)
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
    let s = tapRegion(empty, '110', false, 4)
    s = toggleFull(s, 9)
    expect(s.areas).toEqual([{ regions: ['*'], intensity: 4 }])
    expect(tapRegion(s, '110', false, 4)).toEqual(s)
    expect(toggleFull(s, 9).areas).toEqual([])
  })

  it('the mind joins the current area like any other region, mirror never applying', () => {
    // Alone first: an area of its own at the brush level.
    let s = tapRegion(empty, MIND, true, 6)
    expect(s).toEqual({ areas: [{ regions: [MIND], intensity: 6 }], cur: 0 })
    expect(hasMind(s.areas)).toBe(true)
    expect(mindOnly(s.areas)).toBe(true)
    expect(isMindOnly(s.areas[0])).toBe(true)
    expect(bodyAreas(s.areas)).toEqual([])
    // Tapped again it leaves, the empty area staying current like any emptied one.
    expect(tapRegion(s, MIND, true, 9)).toEqual({ areas: [{ regions: [], intensity: 6 }], cur: 0 })
    // After a body part: one area holding both, at the body's level.
    s = tapRegion(tapRegion(empty, '152', true, 7), MIND, true, 9)
    expect(s).toEqual({ areas: [{ regions: ['152', '153', MIND], intensity: 7 }], cur: 0 })
    expect(mindOnly(s.areas)).toBe(false)
    expect(isMindOnly(s.areas[0])).toBe(false)
    expect(bodyAreas(s.areas)).toEqual(s.areas)
    // A set holding the mind never adds it.
    expect(tapSet(s, [MIND], 9)).toEqual(s)
    // The mind moves between areas like a region: into the current one.
    s = addArea(s, 3)
    s = tapRegion(s, MIND, true, 3)
    expect(s.areas).toEqual([{ regions: ['152', '153'], intensity: 7 }, { regions: [MIND], intensity: 3 }])
    expect(s.cur).toBe(1)
  })

  it('a body tap on an area holding only the mind joins it, the area taking the pain level given', () => {
    let s = tapRegion(empty, MIND, true, 6)
    s = tapRegion(s, '152', true, 7)
    expect(s).toEqual({ areas: [{ regions: ['152', '153', MIND], intensity: 7 }], cur: 0 })
    // So does a limb.
    let u = tapRegion(empty, MIND, true, 6)
    u = tapSet(u, LEG_IDS, 9)
    expect(u.areas).toEqual([{ regions: [...LEG_IDS, MIND].sort(), intensity: 9 }])
    // Only an area holding just the mind takes its level from the highest mental reading.
    const areas = [{ regions: [MIND], intensity: 6 }, { regions: ['152', MIND], intensity: 7 }, { regions: [], intensity: 1 }]
    expect(setMindLevel(areas, 2)).toEqual([{ regions: [MIND], intensity: 2 }, { regions: ['152', MIND], intensity: 7 }, { regions: [], intensity: 1 }])
  })

  it('full body takes the mind along, and the mind can still be toggled under it', () => {
    let s = tapRegion(tapRegion(empty, '110', false, 4), MIND, false, 4)
    s = toggleFull(s, 9)
    expect(s).toEqual({ areas: [{ regions: ['*', MIND], intensity: 4 }], cur: 0 })
    expect(tapRegion(s, '110', false, 4)).toEqual(s)
    expect(tapRegion(s, MIND, false, 4).areas).toEqual([{ regions: ['*'], intensity: 4 }])
    expect(tapRegion(tapRegion(s, MIND, false, 4), MIND, false, 4).areas).toEqual([{ regions: ['*', MIND], intensity: 4 }])
    // Off again: the mind stays, the body goes.
    expect(toggleFull(s, 9)).toEqual({ areas: [{ regions: [MIND], intensity: 4 }], cur: 0 })
    expect(toggleFull({ areas: [{ regions: ['*'], intensity: 4 }], cur: 0 }, 9).areas).toEqual([])
    // A mind alone in its own area (older data) merges into the full body too.
    const old = { areas: [{ regions: ['110'], intensity: 4 }, { regions: [MIND], intensity: 6 }], cur: 0 }
    expect(toggleFull(old, 9).areas).toEqual([{ regions: ['*', MIND], intensity: 4 }])
    // With nothing but the mind current, full body starts at the brush level.
    expect(toggleFull(tapRegion(empty, MIND, false, 6), 9).areas).toEqual([{ regions: ['*', MIND], intensity: 9 }])
  })

  it('finalize and helpers', () => {
    const areas = finalize([{ regions: ['b', 'a', 'a'], intensity: 3.6 }, { regions: [], intensity: 9 }, { regions: ['*', 'x'], intensity: 11 }])
    expect(areas).toEqual([{ regions: ['a', 'b'], intensity: 4 }, { regions: ['*'], intensity: 10 }])
    // Full body keeps the mind beside its star.
    expect(finalize([{ regions: ['x', MIND, '*'], intensity: 3 }])).toEqual([{ regions: ['*', MIND], intensity: 3 }])
    expect(overallPain(areas, 1)).toBe(10)
    expect(overallPain([], 1)).toBe(1)
    // Only the mind: no body area, so no pain; a body area beside it: its level.
    expect(overallPain([{ regions: [MIND], intensity: 8 }], 5)).toBe(0)
    expect(overallPain([{ regions: [MIND], intensity: 8 }, { regions: ['152'], intensity: 3 }], 5)).toBe(3)
    expect(overallPain([{ regions: ['152', MIND], intensity: 3 }], 5)).toBe(3)
    expect(allRegions(areas)).toEqual(['*', 'a', 'b'])
  })
})

describe('areas edge cases', async () => {
  const A = await import('./areas')
  it('mirror pairs a trunk region with its other side too, and a set already present is removed', () => {
    const s = A.tapRegion({ areas: [], cur: 0 }, '110', true, 4)
    expect(s.areas).toEqual([{ regions: ['110', '111'], intensity: 4 }])
    const legs = A.tapSet({ areas: [], cur: 0 }, ['152', '153'], 4)
    const off = A.tapSet(legs, ['152', '153'], 4)
    expect(off.areas[0]?.regions ?? []).toEqual([])
  })
})
