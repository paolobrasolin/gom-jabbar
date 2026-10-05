/**
 * How many cases a property tries (#91): every one locally, where the suite runs before each commit; a share of them in
 * the Nix build, which CI runs on slower, shared cores, where the full count crowded the screen tests past their time.
 */
export const PROPERTY_SCALE = Number(process.env.PROPERTY_SCALE ?? 1)
export const runs = (n: number): number => Math.max(5, Math.round(n * PROPERTY_SCALE))
