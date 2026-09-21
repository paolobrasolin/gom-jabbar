import { describe, it, expect } from 'vitest'
import { headline, trail, symptomName, regionText, entryHeadline, layerLevel } from './summary'
import { makeEntry } from './entries'
import { DEFAULT_SYMPTOMS } from './vocabulary'
import { t, tl } from '../i18n/index.svelte'
import { prefs } from './prefs.svelte'

describe('headline', () => {
  it('is the highest reading, pain on ties and when nothing else is set', () => {
    expect(headline({ pain: 0, swelling: 3 })).toEqual({ id: 'swelling', value: 3 })
    expect(headline({ pain: 5, swelling: 5 })).toEqual({ id: 'pain', value: 5 })
    expect(headline({ pain: 2 })).toEqual({ id: 'pain', value: 2 })
    expect(headline({})).toEqual({ id: 'pain', value: 0 })
    // An entry's headline is over all its layers; a layer's level is its own headline.
    const e = makeEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }, { regions: ['mind'], readings: { fog: 6 } }] })
    expect(entryHeadline(e)).toEqual({ id: 'fog', value: 6 })
    expect(e.layers.map(layerLevel)).toEqual([4, 6])
  })

  it('names the symptom in the current language, lowercase, and stays quiet for pain', () => {
    prefs.lang = 'it'
    expect(symptomName('swelling', DEFAULT_SYMPTOMS, tl)).toBe('gonfiore')
    expect(symptomName('pain', DEFAULT_SYMPTOMS, tl)).toBe('')
    expect(symptomName('sym-unknown', DEFAULT_SYMPTOMS, tl)).toBe('sym-unknown')
  })
})

describe('trail', () => {
  it('follows one symptom through the history, the max over the layers, and skips points without it', () => {
    const e = makeEntry({ readings: { pain: 2, swelling: 5 } })
    expect(trail(e, 'pain')).toEqual([])
    e.history = [
      { at: '2026-09-15T08:00:00.000Z', layers: [{ pain: 7 }, { pain: 1 }] },
      { at: '2026-09-15T10:00:00.000Z', layers: [{ pain: 4, swelling: 3 }, {}] },
      { at: '2026-09-15T12:00:00.000Z', layers: [{ pain: 2 }, { swelling: 5 }] },
    ]
    expect(trail(e, 'pain')).toEqual([7, 4, 2])
    expect(trail(e, 'swelling')).toEqual([3, 5])
  })
})

describe('regionText', () => {
  it('summarises regions in the current language', () => {
    prefs.lang = 'it'
    expect(regionText(['152', '153', '150'], t)).toBe('fianco sx, gambe')
    expect(regionText(['*'], t)).toBe('tutto il corpo')
    expect(regionText(['mind'], t)).toBe('mente')
    expect(regionText(['mind', '152', '153'], t)).toBe('gambe, mente')
    expect(regionText(['*', 'mind'], t)).toBe('tutto il corpo, mente')
  })
})
