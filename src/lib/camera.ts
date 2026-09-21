/**
 * The camera of a drawing surface (§5.3): a figure drawn under `translate(tx ty) scale(k)` on a
 * stage whose viewBox is its own pixel size. Pure maths, shared by every surface that pans and zooms.
 */
export type Camera = { k: number; tx: number; ty: number }
export type Size = { w: number; h: number }
export type Point = { x: number; y: number }

/** How much bigger than "fitted" the figure opens at, and how far a pinch may go either way. */
export const ZOOM = 2.5
export const ZOOM_RANGE: [number, number] = [1.5, 6]
/** Pixels of stage the figure may be dragged past its edge. */
export const MARGIN = 40

/** The scale at which the whole figure fits the stage. */
export function fitScale(stage: Size, box: Size): number {
  return Math.min(stage.w / box.w, stage.h / box.h)
}

/** Keep the figure on the stage: a side may leave at most `MARGIN` pixels of air, or of overflow when it is larger. */
export function clampCamera(stage: Size, box: Size, { k, tx, ty }: Camera): Camera {
  const axis = (s: number, b: number, v: number) => Math.max(Math.min(0, s - k * b) - MARGIN, Math.min(Math.max(0, s - k * b) + MARGIN, v))
  return { k, tx: axis(stage.w, box.w, tx), ty: axis(stage.h, box.h, ty) }
}

/** A camera at scale `k` with the figure point `centre` in the middle of the stage. */
export function lookAt(stage: Size, k: number, centre: Point): Camera {
  return { k, tx: stage.w / 2 - k * centre.x, ty: stage.h / 2 - k * centre.y }
}

/** Stage coordinates to figure coordinates. */
export function toFigure({ k, tx, ty }: Camera, x: number, y: number): [number, number] {
  return [(x - tx) / k, (y - ty) / k]
}

export type Pinch = { camera: Camera; mid: Point; dist: number }

/**
 * The camera after a pinch that started at `start` and now holds `mid` and `dist` between the fingers:
 * the scale follows the spread, the figure point that was under the fingers' midpoint stays under it.
 * `dist` 0 on both sides is a plain drag.
 */
export function pinchCamera(start: Pinch, mid: Point, dist: number, kRange: [number, number]): Camera {
  const scale = start.dist > 0 && dist > 0 ? dist / start.dist : 1
  const k = Math.max(kRange[0], Math.min(kRange[1], start.camera.k * scale))
  const [fx, fy] = toFigure(start.camera, start.mid.x, start.mid.y)
  return { k, tx: mid.x - fx * k, ty: mid.y - fy * k }
}
