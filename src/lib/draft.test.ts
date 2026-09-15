import { describe, it, expect } from 'vitest'
import { emptyDraft, detailCount } from './draft'

describe('detailCount', () => {
  it('is 0 for a fresh draft', () => {
    expect(detailCount(emptyDraft())).toBe(0)
  })

  it('counts readings other than pain above 0, tags and a non-blank note', () => {
    const d = emptyDraft()
    d.readings = { pain: 7, swelling: 3, fatigue: 0 }
    d.tags = ['rest', 'heat']
    d.note = '   '
    expect(detailCount(d)).toBe(3)
    d.note = 'dopo la corsa'
    expect(detailCount(d)).toBe(4)
  })
})
