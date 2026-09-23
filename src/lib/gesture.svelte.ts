import { clampCamera, pinchCamera, toFigure, type Camera, type Pinch, type Point, type Size } from './camera'

/** What a stage must tell the gesture about itself, read afresh on every event. */
export type Stage = { size: Size; box: Size; kRange: [number, number] }
/** What a lifted finger concluded: it painted a stroke, it swiped, it tapped (the click that follows does the work), or nothing. */
export type Lift = 'stroke' | 'swipe' | 'tap' | 'none'
/** Stage pixels a finger must travel sideways, more than twice as far as it climbs, to turn the figure. */
export const SWIPE = 40

/**
 * The fingers on a stage (§5.3, #22): one finger paints a stroke when it is told to, else it swipes or
 * taps; two pan and pinch; a mouse's secondary button drags. A second finger cancels the stroke or the
 * swipe in progress, and nothing paints again until every finger is up, so a pinch never leaves a
 * smear behind. Coordinates are stage pixels; the stroke is kept in figure coordinates. Reactive, so a
 * stage can draw the live stroke and the camera as they move.
 */
export class StageGesture {
  camera = $state<Camera>({ k: 1, tx: 0, ty: 0 })
  stroke = $state<[number, number][] | null>(null)
  #pointers = new Map<number, Point>()
  #pinch: Pinch | null = null
  #dead = false
  /** Where the lone finger that does not paint came down: a swipe or a tap, decided when it lifts. */
  #start: Point | null = null

  constructor(
    private stage: () => Stage,
    private on: { stroke: (points: [number, number][]) => void; swipe: (dx: number) => void },
  ) {}

  #mid(): Point {
    const [a, b] = [...this.#pointers.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
  #dist(): number {
    const [a, b] = [...this.#pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  /** A finger (or button) down. `paint`: this finger shades. `drag`: a secondary mouse button, which pans instead. */
  down(id: number, x: number, y: number, { drag = false, paint = false } = {}) {
    this.#pointers.set(id, { x, y })
    if (this.#pointers.size === 2) {
      this.stroke = null
      this.#start = null
      this.#dead = true
      this.#pinch = { camera: this.camera, mid: this.#mid(), dist: this.#dist() }
      return
    }
    if (this.#pointers.size > 2 || this.#dead) return
    if (drag) this.#pinch = { camera: this.camera, mid: { x, y }, dist: 0 }
    else if (paint) this.stroke = [toFigure(this.camera, x, y)]
    else this.#start = { x, y }
  }

  move(id: number, x: number, y: number) {
    if (!this.#pointers.has(id)) return
    this.#pointers.set(id, { x, y })
    // More than two fingers: nothing moves until they are two again.
    if (this.#pointers.size > 2) return
    if (this.#pinch) {
      const two = this.#pointers.size === 2
      const { size, box, kRange } = this.stage()
      this.camera = clampCamera(size, box, pinchCamera(this.#pinch, two ? this.#mid() : { x, y }, two ? this.#dist() : 0, kRange))
      return
    }
    if (!this.stroke) return
    const p = toFigure(this.camera, x, y)
    const last = this.stroke[this.stroke.length - 1]
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1) this.stroke = [...this.stroke, p]
  }

  up(id: number): Lift {
    const p = this.#pointers.get(id)
    this.#pointers.delete(id)
    let lift: Lift = 'none'
    if (this.stroke && this.#pointers.size === 0) {
      this.on.stroke(this.stroke)
      this.stroke = null
      lift = 'stroke'
    }
    if (this.#start && p && this.#pointers.size === 0) {
      const dx = p.x - this.#start.x
      const dy = p.y - this.#start.y
      if (Math.abs(dx) >= SWIPE && Math.abs(dx) > 2 * Math.abs(dy)) {
        this.on.swipe(dx)
        lift = 'swipe'
      } else lift = 'tap'
      this.#start = null
    }
    if (this.#pointers.size < 2) this.#pinch = null
    // Back to two fingers: the pinch starts afresh from where they are now, so nothing jumps.
    else if (this.#pinch) this.#pinch = { camera: this.camera, mid: this.#mid(), dist: this.#dist() }
    if (this.#pointers.size === 0) this.#dead = false
    return lift
  }
}
