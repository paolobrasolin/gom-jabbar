import { describe, it, expect } from 'vitest'
import { tapRegion, tapSet, toggleFull, toggleMind, setMindLevel, addArea, selectArea, setIntensity, finalize, overallPain, allRegions, mindOnly, hasMind, bodyAreas } from './areas'
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

  it('the mind toggles an area of its own at the level given, current while it is on', () => {
    let s = toggleMind(empty, 6)
    expect(s).toEqual({ areas: [{ regions: [MIND], intensity: 6 }], cur: 0 })
    expect(hasMind(s.areas)).toBe(true)
    expect(mindOnly(s.areas)).toBe(true)
    expect(bodyAreas(s.areas)).toEqual([])
    expect(setMindLevel(s.areas, 2)).toEqual([{ regions: [MIND], intensity: 2 }])
    // Tapping it through tapRegion is the same toggle; mirror never applies.
    expect(tapRegion(s, MIND, true, 9)).toEqual({ areas: [], cur: 0 })
    expect(toggleMind(s, 6)).toEqual({ areas: [], cur: 0 })
  })

  it('a body tap while the mind is current goes to the last body area, or a new one at the brush level', () => {
    let s = toggleMind(empty, 6)
    s = tapRegion(s, '152', true, 7)
    expect(s.areas).toEqual([{ regions: [MIND], intensity: 6 }, { regions: ['152', '153'], intensity: 7 }])
    expect(s.cur).toBe(1)
    expect(mindOnly(s.areas)).toBe(false)
    // Back to the mind, then a limb: it joins the existing body area, not the mind.
    s = selectArea(s, 0)
    s = tapSet(s, LEG_IDS, 9)
    expect(s.areas[1].regions).toEqual([...LEG_IDS].sort())
    expect(s.areas[0]).toEqual({ regions: [MIND], intensity: 6 })
    expect(s.cur).toBe(1)
    // A set holding the mind never adds it to a body area.
    expect(tapSet(s, [MIND], 9)).toEqual(s)
    // Removing the mind keeps the body area and its level.
    s = toggleMind(s, 0)
    expect(s.areas).toEqual([{ regions: [...LEG_IDS].sort(), intensity: 7 }])
    expect(s.cur).toBe(0)
    // Removing it keeps the body area current, whichever side of the mind it sits and whether it was current.
    const t = toggleMind(tapRegion(empty, '110', false, 3), 5)
    expect(t.cur).toBe(1)
    expect(toggleMind(t, 5)).toEqual({ areas: [{ regions: ['110'], intensity: 3 }], cur: 0 })
    expect(toggleMind({ ...t, cur: 0 }, 5)).toEqual({ areas: [{ regions: ['110'], intensity: 3 }], cur: 0 })
    let u = addArea(toggleMind(empty, 5), 4)
    u = tapRegion(u, '110', false, 4)
    expect(u).toEqual({ areas: [{ regions: [MIND], intensity: 5 }, { regions: ['110'], intensity: 4 }], cur: 1 })
    expect(toggleMind(u, 5)).toEqual({ areas: [{ regions: ['110'], intensity: 4 }], cur: 0 })
  })

  it('full body keeps the mind area and the mind can still be toggled', () => {
    let s = toggleMind(tapRegion(empty, '110', false, 4), 6)
    s = toggleFull(s, 9)
    expect(s.areas).toEqual([{ regions: ['*'], intensity: 9 }, { regions: [MIND], intensity: 6 }])
    expect(s.cur).toBe(0)
    expect(tapRegion(s, '110', false, 4)).toEqual(s)
    expect(tapRegion(s, MIND, false, 4).areas).toEqual([{ regions: ['*'], intensity: 9 }])
    expect(toggleFull(s, 9)).toEqual({ areas: [{ regions: [MIND], intensity: 6 }], cur: 0 })
  })

  it('finalize and helpers', () => {
    const areas = finalize([{ regions: ['b', 'a', 'a'], intensity: 3.6 }, { regions: [], intensity: 9 }, { regions: ['*', 'x'], intensity: 11 }])
    expect(areas).toEqual([{ regions: ['a', 'b'], intensity: 4 }, { regions: ['*'], intensity: 10 }])
    expect(overallPain(areas, 1)).toBe(10)
    expect(overallPain([], 1)).toBe(1)
    // Only the mind: no body area, so no pain; a body area beside it: its level.
    expect(overallPain([{ regions: [MIND], intensity: 8 }], 5)).toBe(0)
    expect(overallPain([{ regions: [MIND], intensity: 8 }, { regions: ['152'], intensity: 3 }], 5)).toBe(3)
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
