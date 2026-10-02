import { describe, it, expect } from 'vitest'
import { headline, trail, symptomName, regionText, entryHeadline, layerLevel } from './summary'
import { makeEntry } from './entries'
import { DEFAULT_SYMPTOMS } from './vocabulary'
import { t, tl } from '../i18n/index.svelte'
import { prefs } from './prefs.svelte'

describe('headline', () => {
  it('is the highest reading, the lead symptom on ties and when nothing else is set', () => {
    expect(headline({ pain: 0, swelling: 3 }, 'pain')).toEqual({ id: 'swelling', value: 3 })
    expect(headline({ pain: 5, swelling: 5 }, 'pain')).toEqual({ id: 'pain', value: 5 })
    expect(headline({ pain: 2 }, 'pain')).toEqual({ id: 'pain', value: 2 })
    expect(headline({}, 'pain')).toEqual({ id: 'pain', value: 0 })
    // Pain is only the seed's lead (#36): whatever leads wins the tie.
    expect(headline({ pain: 5, swelling: 5 }, 'swelling')).toEqual({ id: 'swelling', value: 5 })
    expect(headline({}, 'swelling')).toEqual({ id: 'swelling', value: 0 })
    // A 0 is named after its symptom: the lead stands in only when it was read, or nothing was (#114).
    expect(headline({ anxiety: 0 }, 'pain')).toEqual({ id: 'anxiety', value: 0 })
    expect(headline({ pain: 0, anxiety: 0 }, 'pain')).toEqual({ id: 'pain', value: 0 })
    // An entry's headline is over all its layers; a layer's level is its own headline.
    const e = makeEntry({ layers: [{ regions: ['152'], readings: { pain: 4 } }, { regions: ['mind'], readings: { fog: 6 } }] })
    expect(entryHeadline(e)).toEqual({ id: 'fog', value: 6 })
    expect(e.layers.map(layerLevel)).toEqual([4, 6])
  })

  it('names the symptom in the current language, lowercase, and stays quiet for the lead symptom', () => {
    prefs.lang = 'it'
    expect(symptomName('swelling', DEFAULT_SYMPTOMS, tl)).toBe('gonfiore')
    expect(symptomName('pain', DEFAULT_SYMPTOMS, tl)).toBe('')
    expect(symptomName('sym-unknown', DEFAULT_SYMPTOMS, tl)).toBe('sym-unknown')
    // Pain switched off: swelling leads and goes unnamed, pain's old readings say what they are (#36).
    const off = DEFAULT_SYMPTOMS.map((s) => (s.id === 'pain' ? { ...s, enabled: false } : s))
    expect(symptomName('swelling', off, tl)).toBe('')
    expect(symptomName('pain', off, tl)).toBe('dolore')
    // Moved below swelling, likewise.
    const moved = DEFAULT_SYMPTOMS.map((s) => (s.id === 'pain' ? { ...s, order: 1 } : s.id === 'swelling' ? { ...s, order: 0 } : s))
    expect(symptomName('swelling', moved, tl)).toBe('')
    expect(symptomName('pain', moved, tl)).toBe('dolore')
  })
})

describe('trail', () => {
  it("follows one symptom through an episode's readings, the max over the layers, and skips readings without it", () => {
    const e = makeEntry({ readings: { pain: 2, swelling: 5 } })
    expect(trail([], 'pain')).toEqual([])
    const chain: { layers: { readings: Record<string, number> }[] }[] = [
      { layers: [{ readings: { pain: 7 } }, { readings: { pain: 1 } }] },
      { layers: [{ readings: { pain: 4, swelling: 3 } }, { readings: {} }] },
      { layers: [{ readings: { pain: 2 } }, { readings: { swelling: 5 } }] },
    ]
    expect(trail(chain, 'pain')).toEqual([7, 4, 2])
    expect(trail(chain, 'swelling')).toEqual([3, 5])
    expect(trail([e], 'fog')).toEqual([])
  })
})

describe('regionText', () => {
  it('summarises regions in the current language, naming what was tapped', () => {
    prefs.lang = 'it'
    expect(regionText(['152', '153', '150'], t)).toBe('anca sx, cosce')
    expect(regionText(['104', '105', '204', '205', '130', '131', '230', '231'], t)).toBe('collo, spalle')
    expect(regionText(['154', '155', '254', '255'], t)).toBe('ginocchia')
    expect(regionText(['254'], t)).toBe('dietro il ginocchio sx')
    expect(regionText(['*'], t)).toBe('tutto il corpo')
    expect(regionText(['mind'], t)).toBe('mente')
    expect(regionText(['mind', '152', '153'], t)).toBe('cosce, mente')
    expect(regionText(['*', 'mind'], t)).toBe('tutto il corpo, mente')
    prefs.lang = 'en'
    expect(regionText(['154', '254', '145'], t)).toBe('right hand, left knee')
    expect(regionText(['254', '255'], t)).toBe('backs of knees')
    prefs.lang = 'it'
  })

  it('names three things at most, and counts the rest', () => {
    prefs.lang = 'it'
    expect(regionText(['104', '130', '144', '154', '164'], t)).toBe('collo sx, spalla sx, mano sx + 2')
    expect(regionText(['104', '130', '144', '154', 'mind'], t)).toBe('collo sx, spalla sx, mano sx + 2')
    expect(regionText(['104', '130', '144'], t)).toBe('collo sx, spalla sx, mano sx')
  })
})
