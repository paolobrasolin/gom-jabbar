import { describe, it, expect } from 'vitest'
import { ANATOMY, WORDS, whereItems, type Node } from './anatomy'
import { REGIONS, LEG_IDS, ARM_IDS, HEAD_IDS, TORSO_IDS, sided, FULL_BODY, MIND } from './regions'
import it_ from '../i18n/it.json'
import en from '../i18n/en.json'

const leaves = (n: Node): Node[] => (n.children ? n.children.flatMap(leaves) : [n])
const all = (n: Node): Node[] => [n, ...(n.children ?? []).flatMap(all)]

describe('the anatomy tree', () => {
  it('holds every region name in exactly one leaf', () => {
    const names = ANATOMY.flatMap(leaves).flatMap((l) => l.names)
    expect(new Set(names).size).toBe(names.length)
    expect(new Set(names)).toEqual(new Set(REGIONS.map((r) => r.name)))
  })

  it('gives every word three forms in both languages', () => {
    const words = new Set([...ANATOMY.flatMap(all).map((n) => n.word), ...Object.values(WORDS)])
    for (const w of words) {
      for (const f of ['l', 'r', 'both']) {
        expect((it_ as Record<string, string>)[`part.${w}.${f}`], `it part.${w}.${f}`).toBeTruthy()
        expect((en as Record<string, string>)[`part.${w}.${f}`], `en part.${w}.${f}`).toBeTruthy()
      }
    }
  })

  it('names each region by the part it is, the back view included', () => {
    expect(WORDS['hand.back']).toBe('hand')
    expect(WORDS['shoulder.back']).toBe('shoulder')
    expect(WORDS['knee.back']).toBe('kneeBack')
    expect(WORDS['neck.back']).toBe('neck')
    expect(WORDS.nape).toBe('backOfHead')
  })

  it('has the rail sets as its areas', () => {
    const area = (w: string) => ANATOMY.find((n) => n.word === w)!
    const ids = (n: Node) => REGIONS.filter((r) => all(n).flatMap((x) => x.names).includes(r.name)).map((r) => r.id).sort()
    expect(ids(area('head'))).toEqual([...HEAD_IDS].sort())
    expect(ids(area('trunk'))).toEqual([...TORSO_IDS].sort())
    expect(ids(area('arm'))).toEqual([...ARM_IDS].sort())
    expect(ids(area('leg'))).toEqual([...LEG_IDS].sort())
  })
})

describe('whereItems', () => {
  const both = (...ids: string[]) => ids.flatMap((id) => [id, String(Number(id) + 1)])

  it('names a whole area by its area word, with its side', () => {
    expect(whereItems(LEG_IDS)).toEqual([{ word: 'leg', side: 'both' }])
    expect(whereItems(sided(ARM_IDS, 'r'))).toEqual([{ word: 'arm', side: 'r' }])
    expect(whereItems(HEAD_IDS)).toEqual([{ word: 'head', side: 'both' }])
    expect(whereItems(TORSO_IDS)).toEqual([{ word: 'trunk', side: 'both' }])
  })

  it('names what was tapped, not the area it belongs to', () => {
    // Neck and shoulders, front and back: not "head, arms".
    expect(whereItems(both('104', '204', '130', '230'))).toEqual([
      { word: 'neck', side: 'both' },
      { word: 'shoulder', side: 'both' },
    ])
    expect(whereItems(['154', '254'])).toEqual([{ word: 'knee', side: 'l' }])
    expect(whereItems(['144'])).toEqual([{ word: 'hand', side: 'l' }])
    expect(whereItems([...sided(LEG_IDS, 'l'), '155', '255'])).toEqual([
      { word: 'leg', side: 'l' },
      { word: 'knee', side: 'r' },
    ])
  })

  it('names the back of a part on its own only where it is a different place', () => {
    expect(whereItems(['154'])).toEqual([{ word: 'knee', side: 'l' }])
    expect(whereItems(['254'])).toEqual([{ word: 'kneeBack', side: 'l' }])
    expect(whereItems(['260'])).toEqual([{ word: 'calf', side: 'l' }])
    expect(whereItems(['160', '260'])).toEqual([{ word: 'shinCalf', side: 'l' }])
    expect(whereItems(['262', '263'])).toEqual([{ word: 'heel', side: 'both' }])
    expect(whereItems(['244'])).toEqual([{ word: 'hand', side: 'l' }])
  })

  it('groups the back, and keeps the head segments apart', () => {
    expect(whereItems(both('220', '222', '224'))).toEqual([{ word: 'back', side: 'both' }])
    expect(whereItems(both('224'))).toEqual([{ word: 'lowerBack', side: 'both' }])
    expect(whereItems(both('220', '222', '224', '226'))).toEqual([
      { word: 'back', side: 'both' },
      { word: 'buttock', side: 'both' },
    ])
    expect(whereItems(['100'])).toEqual([{ word: 'forehead', side: 'l' }])
    expect(whereItems(both('202'))).toEqual([{ word: 'backOfHead', side: 'both' }])
  })

  it('follows the body top to bottom whatever the order of the ids, the mind last', () => {
    expect(whereItems(['165', MIND, '130', '104'])).toEqual([
      { word: 'neck', side: 'l' },
      { word: 'shoulder', side: 'l' },
      { word: 'foot', side: 'r' },
      { word: 'mind', side: 'both' },
    ])
  })

  it('reads full body as itself, and ignores what it does not know', () => {
    expect(whereItems([FULL_BODY])).toEqual([{ word: 'full', side: 'both' }])
    expect(whereItems([MIND, FULL_BODY])).toEqual([
      { word: 'full', side: 'both' },
      { word: 'mind', side: 'both' },
    ])
    expect(whereItems(['nope'])).toEqual([])
    expect(whereItems([])).toEqual([])
  })
})
