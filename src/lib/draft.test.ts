import { describe, it, expect } from 'vitest'
import { emptyDraft, detailCount, detailText } from './draft'
import { DEFAULT_SYMPTOMS, DEFAULT_TAGS } from './vocabulary'

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

describe('detailText', () => {
  const tl = (s: { it: string; en: string }) => s.it
  it('is empty for a fresh draft', () => {
    expect(detailText(emptyDraft(), DEFAULT_SYMPTOMS, DEFAULT_TAGS, tl, 'nota')).toBe('')
  })

  it('lists readings other than pain, then tags in vocabulary order, then the note', () => {
    const d = emptyDraft()
    d.readings = { pain: 7, fatigue: 2, swelling: 3 }
    d.tags = ['heat', 'rest', 'gone']
    d.note = ' dopo la corsa '
    expect(detailText(d, DEFAULT_SYMPTOMS, DEFAULT_TAGS, tl, 'nota')).toBe('Gonfiore 3 · Stanchezza 2 · Riposo · Calore · nota')
  })
})
