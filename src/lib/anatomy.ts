import { REGIONS, REGION_BY_ID, FULL_BODY, MIND, type Side } from './regions'

/**
 * The words for where it hurts (#33, §5.3): one vocabulary that nests. Areas (the rail's sets) hold
 * parts; a part of a limb is its front and back segment, one word where they are one place (the hand)
 * and a word of its own for the back where it is another (the back of the knee, the calf). A word
 * means one set of regions wherever it appears, and is an i18n key `part.<word>.<l|r|both>`.
 */
export type Node = {
  word: string
  /** Region names (`RegionDef.name`) on a leaf; a node holds its children's. */
  names: string[]
  children?: Node[]
}

const leaf = (name: string): Node => ({ word: WORDS[name], names: [name] })
const node = (word: string, children: Node[]): Node => ({ word, names: children.flatMap((c) => c.names), children })
/** A limb's part: the front segment and the back one. */
const pair = (word: string, front: string, back: string): Node => node(word, [leaf(front), leaf(back)])

/** Each region name's word, the part it shows when it is named alone. */
export const WORDS: Record<string, string> = Object.fromEntries(REGIONS.map((r) => [r.name, r.word]))

/** The areas, top to bottom: summaries follow this order. */
export const ANATOMY: Node[] = [
  node('head', [leaf('head'), leaf('face'), leaf('head.back'), leaf('nape')]),
  pair('neck', 'neck', 'neck.back'),
  node('trunk', [leaf('chest'), leaf('abdomen'), leaf('groin'), node('back', [leaf('upperback'), leaf('midback'), leaf('lowerback')]), leaf('buttock')]),
  node('arm', [
    pair('shoulder', 'shoulder', 'shoulder.back'),
    pair('upperArm', 'upperarm', 'upperarm.back'),
    pair('elbow', 'elbow', 'elbow.back'),
    pair('forearm', 'forearm', 'forearm.back'),
    pair('wrist', 'wrist', 'wrist.back'),
    pair('hand', 'hand', 'hand.back'),
  ]),
  node('leg', [
    pair('hip', 'hip', 'hip.back'),
    pair('thigh', 'thigh', 'thigh.back'),
    pair('knee', 'knee', 'knee.back'),
    pair('shinCalf', 'shin', 'calf'),
    pair('ankleHeel', 'ankle', 'heel'),
    pair('foot', 'foot', 'foot.back'),
  ]),
]

const ID_BY_NAME_SIDE = new Map(REGIONS.map((r) => [`${r.name}/${r.side}`, r.id]))

export type Where = { word: string; side: Side | 'both' }

/**
 * What a region list covers, in words: on each side the largest node that is wholly there, else its
 * children; a word found on both sides once, as `both`. Full body stands for every body region; the
 * mind comes last. Unknown ids are ignored.
 */
export function whereItems(regions: string[]): Where[] {
  const tail: Where[] = regions.includes(MIND) ? [{ word: MIND, side: 'both' }] : []
  if (regions.includes(FULL_BODY)) return [{ word: 'full', side: 'both' }, ...tail]
  const selected = new Set(regions)
  const named = { l: new Set<Node>(), r: new Set<Node>() }
  const cover = (n: Node, side: Side) => {
    const ids = n.names.map((name) => ID_BY_NAME_SIDE.get(`${name}/${side}`)!)
    if (!ids.some((id) => selected.has(id))) return
    if (!n.children || ids.every((id) => selected.has(id))) named[side].add(n)
    else for (const c of n.children) cover(c, side)
  }
  const sides: Side[] = ['l', 'r']
  for (const a of ANATOMY) for (const side of sides) cover(a, side)
  // Word → the sides it names, in tree order.
  const found = new Map<string, Set<Side>>()
  const walk = (n: Node) => {
    for (const side of sides) if (named[side].has(n)) found.set(n.word, (found.get(n.word) ?? new Set<Side>()).add(side))
    n.children?.forEach(walk)
  }
  ANATOMY.forEach(walk)
  return [...[...found].map(([word, s]): Where => ({ word, side: s.size === 2 ? 'both' : [...s][0] })), ...tail]
}
