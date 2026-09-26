/** WCAG 2 contrast for the colours this app writes: #rrggbb, white, and the ramp's oklch(). Test-only. */

type RGB = [number, number, number]

function oklchToRgb(l: number, c: number, h: number): RGB {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
  // Back to gamma-encoded sRGB, clipped to the gamut as a browser would.
  return lin.map((v) => {
    const x = Math.min(1, Math.max(0, v))
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  }) as RGB
}

export function parseColor(css: string): RGB {
  const s = css.trim()
  if (s === 'white') return [1, 1, 1]
  const hex = /^#([0-9a-f]{6})$/i.exec(s)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255) as RGB
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(s)
  if (ok) return oklchToRgb(Number(ok[1]), Number(ok[2]), Number(ok[3]))
  throw new Error(`unknown colour ${css}`)
}

function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(parseColor(a)), luminance(parseColor(b))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
