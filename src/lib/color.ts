/** Perceptual colour ramp for intensity 0..10. Neutral at 0, warm to red-magenta at 10. */
export function intensityColor(n: number): string {
  if (n <= 0) return 'var(--c-zero)'
  const t = (Math.min(10, Math.max(1, n)) - 1) / 9
  const hue = 95 - t * 75 // yellow → red-magenta
  const chroma = 0.13 + t * 0.09
  const light = 0.84 - t * 0.28
  return `oklch(${light.toFixed(3)} ${chroma.toFixed(3)} ${hue.toFixed(1)})`
}

/**
 * Text colour that reads on top of intensityColor(n), at 4.5:1 or better: dark up to 8, white from 9 (#23). 0 sits on the
 * theme's zero grey, dark in the dark theme, so it takes the theme's ink.
 */
export function intensityInk(n: number): string {
  if (n <= 0) return 'var(--ink)'
  return n >= 9 ? 'white' : 'oklch(0.2 0.02 60)'
}
